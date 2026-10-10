// providers/multimovies/posts.ts
import { Post, ProviderContext } from "../types";

const BASE_URL = "https://multimovies.garden";

function absoluteUrl(value: unknown, base = BASE_URL): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) return "";
  try {
    return new URL(raw, base).href;
  } catch {
    return "";
  }
}

function parseCard($: any, el: any): Post | null {
  const $el = $(el);
  const raw = $el.find("[data-save-title]").attr("data-save-title");
  if (!raw) return null;

  try {
    const data = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    if (!data.url || !data.title) return null;

    const $img = $el.find("img").first();
    const imageCandidate =
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original") ||
      $img.attr("data-image") ||
      $img.attr("src") ||
      (typeof $img.attr("srcset") === "string" ? $img.attr("srcset").split(",")[0].trim().split(/\\s+/)[0] : "") ||
      data.poster ||
      data.image ||
      $el.find("[data-poster]").attr("data-poster") ||
      "";
    const image = absoluteUrl(imageCandidate);
    const link = absoluteUrl(data.url);

    if (!link) return null;
    return {
      title: String(data.title).trim(),
      link,
      image,
      provider: "multimovies",
    };
  } catch (e) {
    console.error("Multimovies card parse error:", e);
    return null;
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
  const { axios, cheerio } = providerContext;
  const url = new URL(filter, BASE_URL);
  if (page > 1) url.searchParams.set("page", String(page));

  try {
    const { data } = await axios.get(url.href);
    const $ = cheerio.load(data);
    const posts: Post[] = [];
    $("article.poster-card").each((_, el) => {
      const post = parseCard($, el);
      if (post) posts.push(post);
    });
    return { posts, hasNext: $('a[rel="next"]').length > 0 };
  } catch (e) {
    console.error("Multimovies getPosts error:", e);
    return { posts: [], hasNext: false };
  }
};

export const getSearchPosts = async function ({
  searchQuery,
  providerContext,
}: {
  searchQuery: string;
  providerContext: ProviderContext;
}): Promise<{ posts: Post[]; hasNext: boolean }> {
  const { axios, cheerio } = providerContext;
  const url = new URL("/search", BASE_URL);
  url.searchParams.set("q", searchQuery.trim());

  try {
    const { data } = await axios.get(url.href);
    const $ = cheerio.load(data);
    const posts: Post[] = [];
    $("article.poster-card").each((_, el) => {
      const post = parseCard($, el);
      if (post) posts.push(post);
    });
    return { posts, hasNext: false };
  } catch (e) {
    console.error("Multimovies getSearchPosts error:", e);
    return { posts: [], hasNext: false };
  }
};
