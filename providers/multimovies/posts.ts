import axios from "axios";
import * as cheerio from "cheerio";

const DOMAINS = [
  "https://multimovies.shop",
  "https://multimovies.click",
  "https://multimovies.ch",
  "https://multimovies.tax",
  "https://multimovies.top"
];

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function getHtml(path: string, signal?: AbortSignal): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "");
  for (const domain of DOMAINS) {
    const url = `${domain}/${cleanPath}`;
    // Try native fetch first
    try {
      const res = await fetch(url, { headers, signal });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500) return text;
      }
    } catch (_) {}

    // Fallback to axios
    try {
      const res = await axios.get(url, { headers, timeout: 8000, signal });
      if (res.data && typeof res.data === "string" && res.data.length > 500) {
        return res.data;
      }
    } catch (_) {}
  }
  return "";
}

function parsePosts(html: string) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const posts: Array<{ title: string; link: string; image: string }> = [];

  $("article.item, div.item, .movies-list .item, div.poster, .flw-item").each((_, el) => {
    const link =
      $(el).find("a").first().attr("href") ||
      $(el).attr("href") ||
      "";

    const title =
      $(el).find(".data h3 a, h3 a, .title a, .data h3").first().text().trim() ||
      $(el).find("img").first().attr("alt") ||
      "";

    let image =
      $(el).find("img").attr("data-src") ||
      $(el).find("img").attr("data-lazy-src") ||
      $(el).find("img").attr("data-original") ||
      $(el).find("img").attr("src") ||
      "";

    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    if (link && title && link !== "#") {
      if (!posts.some((p) => p.link === link)) {
        posts.push({ title, link, image });
      }
    }
  });

  return posts;
}

export const getPosts = async ({
  filter,
  page = 1,
  signal,
}: {
  filter: string;
  page?: number;
  signal?: AbortSignal;
  providerValue?: string;
  providerContext?: any;
}) => {
  try {
    const cleanFilter = filter.replace(/^\/+|\/+$/g, "");
    const path = page === 1 ? `${cleanFilter}/` : `${cleanFilter}/page/${page}/`;
    const html = await getHtml(path, signal);
    return parsePosts(html);
  } catch (error) {
    console.error("Error in getPosts:", error);
    return [];
  }
};

export const getSearchPosts = async ({
  searchQuery,
  page = 1,
  signal,
}: {
  searchQuery: string;
  page?: number;
  signal?: AbortSignal;
  providerValue?: string;
  providerContext?: any;
}) => {
  try {
    const path =
      page === 1
        ? `?s=${encodeURIComponent(searchQuery)}`
        : `page/${page}/?s=${encodeURIComponent(searchQuery)}`;
    const html = await getHtml(path, signal);
    return parsePosts(html);
  } catch (error) {
    console.error("Error in getSearchPosts:", error);
    return [];
  }
};
