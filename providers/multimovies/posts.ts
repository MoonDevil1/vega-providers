const DOMAINS = [
  "https://multimovies.shop",
  "https://multimovies.click",
  "https://multimovies.ch",
  "https://multimovies.tax",
  "https://multimovies.top",
];

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

async function fetchHtml(path: string, signal?: AbortSignal): Promise<string> {
  const cleanPath = path.replace(/^\/+/, "");
  for (const domain of DOMAINS) {
    try {
      const url = `${domain}/${cleanPath}`;
      const res = await fetch(url, { headers, signal });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500) {
          return text;
        }
      }
    } catch (_) {}
  }
  return "";
}

function parsePosts(html: string): Array<{ title: string; link: string; image: string }> {
  const posts: Array<{ title: string; link: string; image: string }> = [];
  const seen = new Set<string>();

  const articleRegex = /<article[\s\S]*?<\/article>/gi;
  let match: RegExpExecArray | null;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[0];

    const linkMatch =
      block.match(/href=["'](https?:\/\/[^"'\s]+)["']/i) ||
      block.match(/href=["'](\/[^"'\s]+)["']/i);
    let link = linkMatch ? linkMatch[1] : "";
    if (link.startsWith("/")) {
      link = `${DOMAINS[0]}${link}`;
    }

    const titleMatch =
      block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
      block.match(/alt=["']([^"']+)["']/i) ||
      block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const imgMatch =
      block.match(/data-src=["']([^"'\s]+)["']/i) ||
      block.match(/data-lazy-src=["']([^"'\s]+)["']/i) ||
      block.match(/data-original=["']([^"'\s]+)["']/i) ||
      block.match(/src=["']([^"'\s]+)["']/i);
    let image = imgMatch ? imgMatch[1] : "";
    if (image.startsWith("//")) {
      image = "https:" + image;
    }
    if (image.includes("data:image")) {
      image = "";
    }

    if (link && title && link !== "#" && !seen.has(link)) {
      seen.add(link);
      posts.push({ title, link, image });
    }
  }

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
    const html = await fetchHtml(path, signal);
    return parsePosts(html);
  } catch (err) {
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
    const html = await fetchHtml(path, signal);
    return parsePosts(html);
  } catch (err) {
    return [];
  }
};
