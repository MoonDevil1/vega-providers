import { Post, ProviderContext } from "../types";

const FALLBACK_DOMAINS = [
  "https://multimovies.shop",
  "https://multimovies.click",
  "https://multimovies.ch",
  "https://multimovies.tax",
  "https://multimovies.top",
];

async function getBaseUrl(providerContext: ProviderContext): Promise<string> {
  if (providerContext.kvStore) {
    try {
      const saved = await providerContext.kvStore.get<string>("baseUrlOverride");
      if (saved) return saved.replace(/\/+$/, "");
    } catch (_) {}
  }
  return FALLBACK_DOMAINS[0];
}

export const getPosts = async function ({
  filter,
  page = 1,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio, commonHeaders } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);
  const cleanFilter = filter.replace(/^\/+|\/+$/g, "");
  const path = page === 1 ? `${cleanFilter}/` : `${cleanFilter}/page/${page}/`;

  const domainList = [baseUrl, ...FALLBACK_DOMAINS.filter((d) => d !== baseUrl)];

  for (const domain of domainList) {
    try {
      const url = `${domain}/${path}`;
      const res = await axios.get(url, {
        headers: {
          ...commonHeaders,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        timeout: 10000,
        signal,
      });

      if (!res?.data) continue;
      const $ = cheerio.load(res.data);
      const posts: Post[] = [];

      $("article.item, div.item, .movies-list .item, div.poster").each((_, el) => {
        const link = $(el).find("a").first().attr("href") || "";
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

        if (image && image.startsWith("//")) image = "https:" + image;

        if (link && title && link !== "#") {
          if (!posts.some((p) => p.link === link)) {
            posts.push({ title, link, image });
          }
        }
      });

      if (posts.length > 0) return posts;
    } catch (_) {}
  }

  return [];
};

export const getSearchPosts = async function ({
  searchQuery,
  page = 1,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, cheerio, commonHeaders } = providerContext;
  const baseUrl = await getBaseUrl(providerContext);
  const path =
    page === 1
      ? `?s=${encodeURIComponent(searchQuery)}`
      : `page/${page}/?s=${encodeURIComponent(searchQuery)}`;

  const domainList = [baseUrl, ...FALLBACK_DOMAINS.filter((d) => d !== baseUrl)];

  for (const domain of domainList) {
    try {
      const url = `${domain}/${path}`;
      const res = await axios.get(url, {
        headers: {
          ...commonHeaders,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        timeout: 10000,
        signal,
      });

      if (!res?.data) continue;
      const $ = cheerio.load(res.data);
      const posts: Post[] = [];

      $("article.item, div.item, .result-item, div.poster").each((_, el) => {
        const link = $(el).find("a").first().attr("href") || "";
        const title =
          $(el).find(".details .title a, .data h3 a, h3 a, .title a").first().text().trim() ||
          $(el).find("img").first().attr("alt") ||
          "";
        let image =
          $(el).find("img").attr("data-src") ||
          $(el).find("img").attr("data-lazy-src") ||
          $(el).find("img").attr("src") ||
          "";

        if (image && image.startsWith("//")) image = "https:" + image;

        if (link && title && link !== "#") {
          if (!posts.some((p) => p.link === link)) {
            posts.push({ title, link, image });
          }
        }
      });

      if (posts.length > 0) return posts;
    } catch (_) {}
  }

  return [];
};
