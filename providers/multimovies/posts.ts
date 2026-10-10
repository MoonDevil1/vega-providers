// Multimovies catalog/search posts for Vega.
import { Post, ProviderContext } from "../types";

const BASE_URL = "https://multimovies.garden";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: BASE_URL + "/",
};

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

function parseJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
    } catch {
      return null;
    }
  }
}

function parseCards($: any, baseUrl: string): Post[] {
  const out: Post[] = [];
  const seen = new Set<string>();
  const addCard = ($card: any, $anchor: any, rawItem?: any) => {
    const item = rawItem || {};
    // Keep title, URL and artwork scoped to the same result card. The site's
    // search layout uses .result-item; its archive uses article/.items cards.
    const $titleLink = $card.find(
      ".details .title a[href], .data h3 a[href], h2 a[href], h3 a[href], .entry-title a[href], a[rel='bookmark']"
    ).first();
    const $posterLink = $card.find(".image a[href], .poster a[href], a.poster-art[href]").first();
    const $chosenAnchor = $titleLink.length ? $titleLink : ($anchor.length ? $anchor : $posterLink);
    const $img = $card.find("div.image img, div.poster img, .poster img, .image img, img").first();
    const $caption = $card.find(
      ".details .title a, .details .title, .data h3 a, .entry-title a, .entry-title, h2 a, h2, h3 a, h3"
    ).first();
    const title = String(
      item.title ||
      $caption.text() ||
      $chosenAnchor.attr("aria-label") ||
      $chosenAnchor.attr("title") ||
      $img.attr("alt") ||
      $card.attr("data-title") ||
      ""
    ).replace(/\\s+/g, " ").trim();
    const link = abs(item.url || $titleLink.attr("href") || $chosenAnchor.attr("href") || $posterLink.attr("href") || "", baseUrl);
    if (!title || !link || seen.has(link) || !/^https?:$/i.test(new URL(link).protocol)) return;

    const srcset = $img.attr("data-srcset") || $img.attr("srcset") || "";
    const srcsetUrl = srcset ? srcset.split(",")[0].trim().split(/\\s+/)[0] : "";
    const candidates = [
      item.poster, item.image, item.image_url,
      $img.attr("data-src"), $img.attr("data-lazy-src"), $img.attr("data-original"),
      $img.attr("data-image"), $img.attr("data-poster"), $img.attr("data-lazy"),
      $img.attr("src"), srcsetUrl
    ];
    const imageRaw = candidates.find((value) =>
      typeof value === "string" &&
      value.trim() &&
      !/^(data:|about:blank|#)/i.test(value.trim()) &&
      !/(placeholder|no[-_]?image|blank\.gif|transparent\.png)/i.test(value)
    ) || "";
    const image = abs(imageRaw, baseUrl);
    if (!image) return;
    seen.add(link);
    out.push({ title, link, image, provider: "multimovies" });
  };

  const cardSelectors = [
    "div.result-item", ".items article", "#archive-content article",
    "article.item", "article.poster-card", ".poster-card",
    "article.movie-card", ".movie-card"
  ];
  $(cardSelectors.join(", ")).each((_: number, el: any) => {
    const $card = $(el);
    const raw = $card.find("[data-save-title]").first().attr("data-save-title") || $card.attr("data-save-title") || "";
    const item = raw ? parseJson(raw) : undefined;
    const $anchor = $card.find(
      ".details .title a[href], .data h3 a[href], .image a[href], .poster a[href], a.poster-art[href], h2 a[href], h3 a[href], a[rel='bookmark']"
    ).first();
    addCard($card, $anchor, item);
  });

  // Some versions expose JSON metadata instead of semantic cards.
  if (out.length === 0) {
    $("[data-save-title]").each((_: number, el: any) => {
      const $marker = $(el);
      const item = parseJson($marker.attr("data-save-title") || "");
      if (!item) return;
      const $card = $marker.closest("article, .result-item, .poster-card, .movie-card, .card");
      const $scope = $card.length ? $card : $marker;
      addCard($scope, $scope.find("a[href]").first(), item);
    });
  }
  return out;
}

function looksBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return ["cf-chl-", "challenge-platform", "checking your browser", "just a moment", "attention required", "ddos-guard"].some(s => lower.includes(s));
}

let verificationInFlight: Promise<{ data: string; cookies: string; url: string } | null> | null = null;
let verificationAttempted = false;
const COOKIE_STORE_KEY = "multimovies.cloudflare.session";
let cachedSession: { cookies: string; userAgent: string } | null = null;

async function fetchHtml(url: string, providerContext: ProviderContext): Promise<string> {
  const { axios, kvStore } = providerContext;
  const headers: Record<string, string> = { ...REQUEST_HEADERS };

  // Use static HTTP only. Opening a WebView for every blocked catalog/search
  // request caused the verification mini-window to appear and its HTML could
  // be mistaken for the requested page. Never parse a challenge page as posts.
  try {
    const saved = await kvStore.get<{ cookies?: string; userAgent?: string }>(COOKIE_STORE_KEY);
    if (saved?.cookies) headers.Cookie = saved.cookies;
    if (saved?.userAgent) headers["User-Agent"] = saved.userAgent;
  } catch {}

  try {
    const response = await axios.get(url, {
      headers,
      timeout: 20000,
      maxRedirects: 5,
    });
    const html = typeof response.data === "string" ? response.data : "";
    if (!html || looksBlocked(html)) {
      console.warn("Multimovies returned an empty page or verification challenge; skipping parse.", url);
      return "";
    }
    return html;
  } catch (error) {
    console.warn("Multimovies static request failed.", url, error);
    return "";
  }
}

async function fetchPosts(url: string, providerContext: ProviderContext): Promise<{ posts: Post[]; hasNext: boolean }> {
  const html = await fetchHtml(url, providerContext);
  if (!html) return { posts: [], hasNext: false };
  const $ = providerContext.cheerio.load(html);
  const posts = parseCards($, url);
  const hasNext = $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
  console.log("Multimovies catalog result:", { url, cards: posts.length, htmlLength: html.length });
  return { posts, hasNext: hasNext && posts.length > 0 };
}

function buildCatalogUrl(filter: string | undefined, page: number): string {
  const route = filter || "/movies/";
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
  const result = await fetchPosts(url, providerContext);
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
  const url = new URL("/", BASE_URL);
  url.searchParams.set("s", searchQuery.trim());
  if (page > 1) url.searchParams.set("page", String(page));
  const result = await fetchPosts(url.href, providerContext);
  return result.posts;
};
