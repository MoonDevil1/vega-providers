// Multimovies catalog/search posts for Vega.
import { Post, ProviderContext } from "../types";

import { BASE_URL, fetchHtml } from "./http";

function abs(value: unknown, base = BASE_URL): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || /^(data|javascript):/i.test(raw)) return "";
  try {
    return new URL(raw.replace(/&amp;/g, "&"), base).href;
  } catch {
    return "";
  }
}

function parseCards($: any, baseUrl: string): Post[] {
  const out: Post[] = [];
  const seen = new Set<string>();
  const cardSelector = "article, li, .poster-card, .movie-card, .movie-item, .film-item, .flw-item, .result-item, .item, .card, .post, .search-item";
  const imageAttrs = [
    "data-src", "data-lazy-src", "data-original", "data-image",
    "data-poster", "data-poster-url", "data-lazy", "data-thumb",
    "data-cover", "data-url", "src", "srcset", "data-srcset"
  ];

  const parsePayload = (raw: string): any => {
    if (!raw) return {};
    const candidates = [raw, raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
    }
    return {};
  };

  const firstString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };

  const add = (scope: any, rawItem?: any) => {
    if (!scope || !scope.length) return;
    const item = rawItem || {};
    const titleLink = (scope.is("a[href]") ? scope : scope.find(
      ".details .title a[href], .data h3 a[href], .entry-title a[href], h1 a[href], h2 a[href], h3 a[href], .title a[href], a[rel='bookmark'], a[href]"
    )).filter((_: number, el: any) => {
      const href = String($(el).attr("href") || "");
      return href && !/^(#|javascript:|mailto:|tel:)/i.test(href);
    }).first();

    const img = scope.is("img, source") ? scope : scope.find("picture img, picture source, img, source").first();
    const caption = scope.find(".title, .name, .entry-title, h1, h2, h3, [class*='title'], [class*='name']").first();
    const title = firstString(
      item.title, item.name, item.label, item.movie_title,
      scope.attr("data-title"), scope.attr("title"),
      titleLink.attr("title"), titleLink.attr("aria-label"),
      caption.text(), img.attr("alt"), titleLink.text()
    ).replace(/\s+/g, " ");

    const rawHref = firstString(
      item.url, item.link, item.href, item.detail_url, item.detailUrl,
      titleLink.attr("href"), scope.attr("data-href"), scope.attr("data-url")
    );
    const href = abs(rawHref, baseUrl);
    if (!title || !href || seen.has(href)) return;
    // A broad image fallback must not turn navigation logos/adverts into posts.
    if (!/^\/(?:movie|movies|series|tvshows)\/[^/]+/i.test(new URL(href).pathname)) return;

    let imageRaw = firstString(
      item.poster, item.poster_url, item.posterUrl, item.image, item.image_url,
      item.imageUrl, item.thumbnail, item.thumbnail_url, item.thumb,
      item.cover, item.cover_url, item.backdrop, item.src
    );

    if (!imageRaw) {
      for (const attr of imageAttrs) {
        const value = img.attr(attr);
        if (typeof value !== "string" || !value.trim()) continue;
        const candidate = attr.includes("srcset") ? value.split(",")[0].trim().split(/\s+/)[0] : value.trim();
        if (/^(data:|about:blank|#)/i.test(candidate) ||
            /(placeholder|no[-_]?image|blank\.gif|transparent\.png|loading)/i.test(candidate)) continue;
        imageRaw = candidate;
        break;
      }
    }

    if (!imageRaw) {
      imageRaw = firstString(
        scope.attr("data-poster"), scope.attr("data-poster-url"),
        scope.attr("data-image"), scope.attr("data-src"), scope.attr("data-thumb"),
        scope.find("[data-poster]").first().attr("data-poster"),
        scope.find("[data-image]").first().attr("data-image"),
        scope.find("[data-src]").first().attr("data-src")
      );
    }
    if (!imageRaw) {
      const styled = String(scope.attr("style") || scope.find("[style*='background']").first().attr("style") || "")
        .match(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (styled?.[1]) imageRaw = styled[1];
    }

    const image = abs(imageRaw, baseUrl);
    if (!/^https?:$/i.test(new URL(href).protocol)) return;
    // Do not emit entries without a usable poster: Vega renders those as blank
    // skeleton cards, which looks like a successful catalog response to users.
    if (!image || !/^https?:$/i.test(new URL(image).protocol)) return;

    seen.add(href);
    out.push({ title, link: href, image, provider: "multimovies" });
  };

  // data-save-title is sometimes attached to a small control nested inside the
  // poster card, not to the card itself. Read its JSON but parse the enclosing
  // card so title links and lazy-loaded poster images stay associated.
  $("[data-save-title]").each((_: number, el: any) => {
    const node = $(el);
    const raw = node.attr("data-save-title") || "";
    const card = node.closest(cardSelector);
    add(card.length ? card : node, parsePayload(raw));
  });

  // Support common card layouts used by the site's older and newer themes.
  const selectors = [
    "article.poster-card", ".poster-card", ".movie-card", ".movie-item",
    ".film-item", ".result-item", ".items article", "#archive-content article",
    "article.item", ".search-item", ".flw-item", ".item", ".card"
  ];
  $(selectors.join(", ")).each((_: number, el: any) => {
    const scope = $(el);
    const raw = scope.attr("data-save-title") ||
      scope.find("[data-save-title]").first().attr("data-save-title") || "";
    add(scope, parsePayload(raw));
  });

  // Last-resort parser for simple grids and anchor-wrapped posters.
  if (!out.length) {
    $("a[href] img, article img, .items img, .grid img, img").each((_: number, el: any) => {
      const node = $(el);
      const scope = node.closest(cardSelector);
      add(scope.length ? scope : node.closest("a[href]"), undefined);
    });
  }

  return out;
}
async function fetchPosts(url: string, providerContext: ProviderContext, signal?: AbortSignal): Promise<{ posts: Post[]; hasNext: boolean }> {
  const html = await fetchHtml(url, providerContext, signal);
  if (!html) return { posts: [], hasNext: false };
  const $ = providerContext.cheerio.load(html);
  const posts = parseCards($, url);
  const hasNext = $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
  return { posts, hasNext: hasNext && posts.length > 0 };
}

function buildCatalogUrl(filter: string | undefined, page: number): string {
  const route = filter || "/";
  const url = new URL(route, BASE_URL);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.href;
}

export const getPosts = async function ({
  filter,
  page = 1,
  signal,
  providerContext,
}: {
  filter?: string;
  page?: number;
  signal?: AbortSignal;
  providerValue?: string;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const url = buildCatalogUrl(filter, page);
  const result = await fetchPosts(url, providerContext, signal);
  return result.posts;
};

export const getSearchPosts = async function ({
  searchQuery,
  page = 1,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page?: number;
  signal?: AbortSignal;
  providerValue?: string;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  if (!searchQuery.trim()) return [];
  // The live site exposes its search at /search?q=..., not WordPress's ?s=.
  const url = new URL("/search", BASE_URL);
  url.searchParams.set("q", searchQuery.trim());
  if (page > 1) url.searchParams.set("page", String(page));
  const result = await fetchPosts(url.href, providerContext, signal);
  return result.posts;
};
