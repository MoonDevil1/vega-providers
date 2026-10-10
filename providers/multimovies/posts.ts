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

// Parse the site's real poster markup first. Current pages use
// <article class="poster-card"><a class="poster-art" href="...">
// with an image and caption; data-save-title is not present on every card.
function parseCards($: any, baseUrl: string): Post[] {
  const out: Post[] = [];
  const seen = new Set<string>();

  const addCard = ($card: any, $anchor: any, rawItem?: any) => {
    const item = rawItem || {};
    const $img = $anchor.find("img").first().length
      ? $anchor.find("img").first()
      : $card.find("img").first();
    const $caption = $card.find(
      ".poster-caption, .entry-title, .post-title, .title, h2, h3",
    ).first();

    const title = String(
      item.title ||
      $anchor.attr("aria-label") ||
      $anchor.attr("title") ||
      $img.attr("alt") ||
      $caption.text() ||
      $card.attr("aria-label") ||
      "",
    ).replace(/\\s+/g, " ").trim();
    const link = abs(item.url || $anchor.attr("href") || $card.find("a[href]").first().attr("href") || "", baseUrl);
    if (!title || !link || seen.has(link)) return;
    seen.add(link);

    const srcset = $img.attr("srcset") || $img.attr("data-srcset") || "";
    const srcsetUrl = srcset ? srcset.split(",")[0].trim().split(/\\s+/)[0] : "";
    const imageRaw =
      item.poster || item.image || item.image_url ||
      $img.attr("data-src") || $img.attr("data-lazy-src") ||
      $img.attr("data-original") || $img.attr("data-image") ||
      $img.attr("data-poster") || $img.attr("src") || srcsetUrl || "";
    out.push({ title, link, image: abs(imageRaw, baseUrl), provider: "multimovies" });
  };

  $("article.poster-card, .poster-card, article.movie-card, .movie-card").each((_: number, el: any) => {
    const $card = $(el);
    const $anchor = $card.find("a.poster-art[href], a[href]").first();
    const raw = $card.find("[data-save-title]").first().attr("data-save-title") ||
      $card.attr("data-save-title") || "";
    addCard($card, $anchor, raw ? parseJson(raw) : undefined);
  });

  // Some site pages use different card wrappers or only expose the JSON marker.
  if (out.length === 0) {
    $("[data-save-title]").each((_: number, el: any) => {
      const $marker = $(el);
      const item = parseJson($marker.attr("data-save-title") || "");
      if (!item) return;
      const $card = $marker.closest("article, .poster-card, .movie-card, .card");
      const $anchor = $card.find("a[href]").first();
      addCard($card.length ? $card : $marker, $anchor, item);
    });
  }

  // Last-resort support for poster cards without a known wrapper class.
  if (out.length === 0) {
    $("a.poster-art[href], article a[href]").each((_: number, el: any) => {
      const $anchor = $(el);
      const $card = $anchor.closest("article, .poster-card, .movie-card, .card");
      if (!$card.length) return;
      addCard($card, $anchor);
    });
  }

  return out;
}

function looksBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("cf-chl-") ||
    lower.includes("challenge-platform") ||
    lower.includes("checking your browser") ||
    lower.includes("just a moment") ||
    lower.includes("attention required") ||
    lower.includes("ddos-guard")
  );
}

// Share a single verification dialog across simultaneous Home/Search requests.
// Vega may request several catalog sections at once; opening one WebView per section
// causes the verification dialog to reopen every time the user taps Done.
let verificationInFlight: Promise<{ data: string; cookies: string; url: string } | null> | null = null;
const COOKIE_STORE_KEY = "multimovies.cloudflare.session";
let cachedSession: { cookies: string; userAgent: string } | null = null;

async function fetchHtml(
  url: string,
  providerContext: ProviderContext,
): Promise<string> {
  const { axios, openWebView, kvStore } = providerContext;
  let html = "";
  let cookies = "";
  let userAgent = REQUEST_HEADERS["User-Agent"];

  try {
    const saved = await kvStore.get<{ cookies?: string; userAgent?: string }>(COOKIE_STORE_KEY);
    if (saved && typeof saved === "object") {
      cookies = saved.cookies || "";
      userAgent = saved.userAgent || userAgent;
      if (cookies) cachedSession = { cookies, userAgent };
    }
  } catch {
    // Continue without a stored session if provider storage is unavailable.
  }
  if (cachedSession) {
    cookies = cachedSession.cookies;
    userAgent = cachedSession.userAgent;
  }

  const request = async (cookieHeader: string, agent: string) => {
    const headers: Record<string, string> = { ...REQUEST_HEADERS, "User-Agent": agent };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const response = await axios.get(url, { headers, timeout: 20000 });
    return typeof response.data === "string" ? response.data : "";
  };

  try {
    html = await request(cookies, userAgent);
    if (html && !looksBlocked(html)) return html;
    console.warn("Multimovies returned a verification page.");
  } catch (error) {
    console.warn("Multimovies direct request failed.", error);
  }

  // Try one shared WebView challenge for all concurrent catalog requests.
  if (!verificationInFlight) {
    verificationInFlight = (async () => {
      try {
        const result = await openWebView(url, {
          title: "Verify Multimovies",
          description: "Complete verification once. Vega will reuse the session for catalog and search requests.",
          headers: REQUEST_HEADERS,
          waitForCookie: "cf_clearance",
          force: true,
          timeoutMs: 120000,
        });
        if (!result?.data || looksBlocked(result.data)) return null;
        const sessionCookies = result.cookies || "";
        const sessionUserAgent = result.userAgent || REQUEST_HEADERS["User-Agent"];
        if (sessionCookies) {
          cachedSession = { cookies: sessionCookies, userAgent: sessionUserAgent };
          try {
            await kvStore.set(COOKIE_STORE_KEY, cachedSession);
          } catch (error) {
            console.warn("Could not save Multimovies session.", error);
          }
        }
        return { data: result.data, cookies: sessionCookies, url };
      } catch (error) {
        console.error("Multimovies verification failed.", error);
        return null;
      } finally {
        verificationInFlight = null;
      }
    })();
  }

  const verified = await verificationInFlight;
  if (verified) {
    // Use the WebView HTML for the URL being verified. For other simultaneous URLs,
    // retry their own URL with the newly obtained cookies.
    if (verified.url === url) return verified.data;
    if (verified.cookies) {
      try {
        const retried = await request(verified.cookies, cachedSession?.userAgent || REQUEST_HEADERS["User-Agent"]);
        if (retried && !looksBlocked(retried)) return retried;
      } catch (error) {
        console.warn("Multimovies retry with verified session failed.", error);
      }
    }
    return verified.data;
  }

  return html;
}

async function fetchPosts(
  url: string,
  providerContext: ProviderContext,
): Promise<{ posts: Post[]; hasNext: boolean }> {
  const { cheerio } = providerContext;
  try {
    const html = await fetchHtml(url, providerContext);
    if (!html) return { posts: [], hasNext: false };

    const $ = cheerio.load(html);
    const posts = parseCards($, url);
    const hasNext =
      $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
    console.log("Multimovies catalog result:", {
      url,
      status: looksBlocked(html) ? "blocked" : "html received",
      cards: posts.length,
      htmlLength: html.length,
    });
    return { posts, hasNext: hasNext && posts.length > 0 };
  } catch (error) {
    console.error("Multimovies catalog parsing failed:", url, error);
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
