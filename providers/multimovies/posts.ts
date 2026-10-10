// Multimovies catalog/search posts for Vega.
import { Post, ProviderContext } from "../types";

const BASE_URL = "https://multimovies.garden";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": BASE_URL + "/",
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

  // Match the current site's card structure, with a fallback for markup changes.
  $("[data-save-title]").each((_: number, el: any) => {
    const $card = $(el);
    const raw = $card.attr("data-save-title");
    if (!raw) return;
    const item = parseJson(raw);
    if (!item) return;

    const title = String(item.title || $card.find("h2,h3,.title").first().text() || "").trim();
    const linkRaw =
      item.url ||
      $card.attr("href") ||
      $card.find("a[href]").first().attr("href") ||
      "";
    const link = abs(linkRaw, baseUrl);
    if (!title || !link || seen.has(link)) return;
    seen.add(link);

    // The reference provider reads src first; this site may also lazy-load images.
    const $img = $card.find("img").first();
    const srcset = $img.attr("srcset") || $img.attr("data-srcset") || "";
    const srcsetUrl = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "";
    const imageRaw =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original") ||
      $img.attr("data-image") ||
      $img.attr("data-poster") ||
      $card.attr("data-poster") ||
      srcsetUrl ||
      item.poster ||
      item.image ||
      item.image_url ||
      "";
    const image = abs(imageRaw, baseUrl);

    out.push({
      title,
      link,
      image,
      provider: "multimovies",
    });
  });

  return out;
}

async function fetchPosts(url: string, providerContext: ProviderContext): Promise<{ posts: Post[]; hasNext: boolean }> {
  const { axios, cheerio } = providerContext;
  try {
    const response = await axios.get(url, { headers: REQUEST_HEADERS, timeout: 20000 });
    const $ = cheerio.load(response.data);
    const posts = parseCards($, url);
    const hasNext = $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
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
