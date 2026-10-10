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
      return JSON.parse(
        raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
      );
    } catch {
      return null;
    }
  }
}

// Match the reference provider: inspect each poster card, then read the
// data-save-title JSON embedded somewhere inside that card.
function parseCards($: any, baseUrl: string): Post[] {
  const out: Post[] = [];
  const seen = new Set<string>();

  $("article.poster-card").each((_: number, el: any) => {
    const $card = $(el);
    const raw =
      $card.find("[data-save-title]").first().attr("data-save-title") ||
      $card.attr("data-save-title");
    if (!raw) return;

    const item = parseJson(raw);
    if (!item) return;

    const title = String(item.title || "").trim();
    const link = abs(item.url || "", baseUrl);
    if (!title || !link || seen.has(link)) return;
    seen.add(link);

    const $img = $card.find("img").first();
    const srcset = $img.attr("srcset") || $img.attr("data-srcset") || "";
    const srcsetUrl = srcset
      ? srcset.split(",")[0].trim().split(/\s+/)[0]
      : "";
    const imageRaw =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original") ||
      $img.attr("data-image") ||
      $img.attr("data-poster") ||
      item.poster ||
      item.image ||
      item.image_url ||
      srcsetUrl ||
      "";
    const image = abs(imageRaw, baseUrl);

    out.push({
      title,
      link,
      image,
      provider: "multimovies",
    });
  });

  // Fallback in case the site changes its outer card tag but retains the
  // same data-save-title JSON marker.
  if (out.length === 0) {
    $("[data-save-title]").each((_: number, el: any) => {
      const $marker = $(el);
      const item = parseJson($marker.attr("data-save-title") || "");
      if (!item) return;

      const title = String(item.title || "").trim();
      const link = abs(item.url || "", baseUrl);
      if (!title || !link || seen.has(link)) return;
      seen.add(link);

      const $card = $marker.closest("article, .poster-card, .movie-card, .card");
      const $img = $card.find("img").first();
      const imageRaw =
        $img.attr("src") ||
        $img.attr("data-src") ||
        $img.attr("data-lazy-src") ||
        $img.attr("data-original") ||
        item.poster ||
        item.image ||
        item.image_url ||
        "";
      out.push({
        title,
        link,
        image: abs(imageRaw, baseUrl),
        provider: "multimovies",
      });
    });
  }

  return out;
}

async function fetchPosts(
  url: string,
  providerContext: ProviderContext,
): Promise<{ posts: Post[]; hasNext: boolean }> {
  const { axios, cheerio } = providerContext;
  try {
    const response = await axios.get(url, {
      headers: REQUEST_HEADERS,
      timeout: 20000,
    });
    const $ = cheerio.load(response.data);
    const posts = parseCards($, url);
    const hasNext =
      $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
    console.log("Multimovies catalog:", url, "cards:", posts.length);
    return { posts, hasNext: hasNext && posts.length > 0 };
  } catch (error) {
    console.error("Multimovies catalog request failed:", url, error);
    return { posts: [], hasNext: false };
  }
}

export const getPosts = async function ({
  filter,
  page,
  providerContext,
}: {
  filter: string;
  page: number;
  providerContext: ProviderContext;
}): Promise<{ posts: Post[]; hasNext: boolean }> {
  const url = new URL(filter || "/", BASE_URL);
  if (page > 1) url.searchParams.set("page", String(page));
  return fetchPosts(url.href, providerContext);
};

export const getSearchPosts = async function ({
  searchQuery,
  providerContext,
}: {
  searchQuery: string;
  providerContext: ProviderContext;
}): Promise<{ posts: Post[]; hasNext: boolean }> {
  const url = new URL("/search", BASE_URL);
  url.searchParams.set("q", searchQuery.trim());
  const result = await fetchPosts(url.href, providerContext);
  return { ...result, hasNext: false };
};
