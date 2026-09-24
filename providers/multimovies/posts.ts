import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://multimovies.tax";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: BASE_URL,
};

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
    const url =
      page === 1
        ? `${BASE_URL}${filter}/`
        : `${BASE_URL}${filter}/page/${page}/`;

    const response = await axios.get(url, { headers, signal });
    const $ = cheerio.load(response.data);
    const posts: Array<{ title: string; link: string; image: string }> = [];

    $("article.item, div.item, .movies-list .item, div.poster").each((_, el) => {
      const title =
        $(el).find(".data h3 a, .title a").first().text().trim() ||
        $(el).find("img").first().attr("alt") ||
        "";
      const link = $(el).find("a").first().attr("href") || "";
      const image =
        $(el).find("img").attr("data-src") ||
        $(el).find("img").attr("src") ||
        "";

      if (link && title) {
        posts.push({ title, link, image });
      }
    });

    return posts;
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
    const url =
      page === 1
        ? `${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`
        : `${BASE_URL}/page/${page}/?s=${encodeURIComponent(searchQuery)}`;

    const response = await axios.get(url, { headers, signal });
    const $ = cheerio.load(response.data);
    const posts: Array<{ title: string; link: string; image: string }> = [];

    $("article.item, div.result-item, div.item").each((_, el) => {
      const title =
        $(el).find(".details .title a, .data h3 a, h3 a").first().text().trim() ||
        $(el).find("img").first().attr("alt") ||
        "";
      const link = $(el).find("a").first().attr("href") || "";
      const image =
        $(el).find("img").attr("data-src") ||
        $(el).find("img").attr("src") ||
        "";

      if (link && title) {
        posts.push({ title, link, image });
      }
    });

    return posts;
  } catch (error) {
    console.error("Error in getSearchPosts:", error);
    return [];
  }
};
