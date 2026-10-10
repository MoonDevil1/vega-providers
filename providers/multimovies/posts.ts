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
  // The current site uses article.poster-card with a JSON payload in data-save-title.
  // Keep older theme selectors as a fallback for pages that still use them.
  const selectors = [
    // Prefer the site's serialized card payload wherever the redesign places it.
    "[data-save-title]", "article.poster-card", ".poster-card",
    ".result-item", ".items article", "#archive-content article",
    "article.item", "article.movie-card", ".movie-card",
    ".search-item", ".flw-item"
  ];

  const add = (scope: any, rawItem?: any) => {
    const item = rawItem || {};
    const titleLink = (scope.is("a[href]") ? scope : scope.find(
      ".details .title a[href], .data h3 a[href], .entry-title a[href], h2 a[href], h3 a[href], a[rel='bookmark'], a[href]"
    )).filter((_: number, el: any) => {
      const href = $(el).attr("href") || "";
      return href && !/^(#|javascript:|mailto:)/i.test(href);
    }).first();
    const img = (scope.is("img, source") ? scope : scope.find("picture img, img, source")).first();
    const caption = scope.find(".title, .name, .entry-title, h2, h3, [class*='title'], [class*='name']").first();
    const title = String(
      item.title || scope.attr("data-title") || scope.attr("title") ||
      titleLink.attr("title") || titleLink.attr("aria-label") ||
      caption.text() || img.attr("alt") || ""
    ).replace(/\s+/g, " ").trim();
    const href = abs(item.url || item.link || titleLink.attr("href") || "", baseUrl);
    if (!title || !href || seen.has(href)) return;
    let imageRaw = item.poster || item.image || item.image_url || item.thumbnail || "";
    if (!imageRaw) {
      for (const attr of ["data-src", "data-lazy-src", "data-original", "data-image", "data-poster", "data-lazy", "data-thumb", "src", "srcset", "data-srcset"]) {
        const value = img.attr(attr);
        if (typeof value === "string" && value.trim()) {
          imageRaw = attr.includes("srcset") ? value.split(",")[0].trim().split(/\s+/)[0] : value;
          if (!/^(data:|about:blank|#)/i.test(String(imageRaw)) &&
              !/(placeholder|no[-_]?image|blank\.gif|transparent\.png)/i.test(String(imageRaw))) break;
          imageRaw = "";
        }
      }
    }
    // A few themes store poster URLs on the card itself.
    imageRaw = imageRaw || scope.attr("data-poster") || scope.attr("data-image") || scope.attr("data-src") || "";
    if (!imageRaw) {
      const styled = String(scope.attr("style") || "").match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (styled?.[1]) imageRaw = styled[1];
    }
    const image = abs(imageRaw, baseUrl);
    if (!image || !/^https?:$/i.test(new URL(image).protocol)) return;
    if (!/^https?:$/i.test(new URL(href).protocol)) return;
    seen.add(href);
    out.push({ title, link: href, image, provider: "multimovies" });
  };

  $(selectors.join(", ")).each((_: number, el: any) => {
    const scope = $(el);
    // Avoid emitting nested wrappers for the same URL; dedupe is by post link.
    const raw = scope.attr("data-save-title") || scope.find("[data-save-title]").first().attr("data-save-title") || "";
    let item: any;
    if (raw) {
      item = parseJson(raw) || {};
    }
    add(scope, item);
  });

  // Fallback for redesigns with no recognizable card class: inspect linked images
  // and their nearest article/list/card container, keeping title and poster together.
  if (!out.length) {
    $("a[href] img, a[href] [data-src], article img, .items img, img").each((_: number, el: any) => {
      const node = $(el);
      const scope = node.closest("article, li, .item, .card, .post, .result, a");
      if (!scope.length) return;
      const parent = scope.is("a") ? scope : scope;
      add(parent, undefined);
    });
  }
  return out;
}
function looksBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return ["cf-chl-", "challenge-platform", "checking your browser", "just a moment", "attention required", "ddos-guard"].some(s => lower.includes(s));
}

// The site can return a 200 response containing a JS shell or a WAF page
// without the usual Cloudflare marker. For catalog/search requests, actual
// cards are the reliable signal that the response is usable.
function hasCatalogCards(html: string, providerContext: ProviderContext): boolean {
  if (!html || looksBlocked(html)) return false;
  try {
    const $ = providerContext.cheerio.load(html);
    return $("[data-save-title]").length > 0 ||
      $("article.poster-card, .poster-card, .movie-card, .result-item").length > 0;
  } catch {
    return false;
  }
}

let verificationInFlight: Promise<{ data: string; cookies: string; url: string } | null> | null = null;
let verificationAttempted = false;
const COOKIE_STORE_KEY = "multimovies.cloudflare.session";
const VERIFY_COOLDOWN_KEY = "multimovies.cloudflare.verify-attempted-at";
const VERIFY_COOLDOWN_MS = 10 * 60 * 1000;
let cachedSession: { cookies: string; userAgent: string } | null = null;

async function fetchHtml(url: string, providerContext: ProviderContext): Promise<string> {
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
  } catch {}
  if (cachedSession) ({ cookies, userAgent } = cachedSession);

  const request = async (cookieHeader: string, agent: string) => {
    const headers: Record<string, string> = { ...REQUEST_HEADERS, "User-Agent": agent };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const response = await axios.get(url, { headers, timeout: 20000, maxRedirects: 5 });
    return typeof response.data === "string" ? response.data : "";
  };

  try {
    html = await request(cookies, userAgent);
    // Do not accept a 200 response just because it isn't a recognizable
    // challenge page: the current site sometimes returns a shell without cards.
    if (hasCatalogCards(html, providerContext)) return html;
  } catch (error) {
    console.warn("Multimovies direct request failed.", error);
  }

  // Persist the prompt cooldown because Vega may reload provider modules between
  // category/search/page requests. Without this, each request can reopen WebView.
  let lastVerificationAt = 0;
  try {
    const stored = await kvStore.get<number>(VERIFY_COOLDOWN_KEY);
    if (typeof stored === "number") lastVerificationAt = stored;
  } catch {}
  const cooldownActive = Date.now() - lastVerificationAt < VERIFY_COOLDOWN_MS;

  if (!verificationInFlight && !verificationAttempted && !cooldownActive) {
    verificationAttempted = true;
    try { await kvStore.set(VERIFY_COOLDOWN_KEY, Date.now()); } catch {}
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
        const sessionCookies = result.cookies || Object.entries(result.cookieMap || {}).map(([name, value]) => `${name}=${value}`).join("; ");
        const sessionUserAgent = result.userAgent || REQUEST_HEADERS["User-Agent"];
        if (sessionCookies) {
          cachedSession = { cookies: sessionCookies, userAgent: sessionUserAgent };
          try { await kvStore.set(COOKIE_STORE_KEY, cachedSession); } catch (error) { console.warn("Could not save Multimovies session.", error); }
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
    if (verified.cookies) {
      try {
        const retried = await request(verified.cookies, cachedSession?.userAgent || REQUEST_HEADERS["User-Agent"]);
        if (retried && !looksBlocked(retried)) return retried;
      } catch (error) { console.warn("Multimovies retry with verified session failed.", error); }
    }
    if (verified.url === url && verified.data && !looksBlocked(verified.data)) return verified.data;
  }
  // The direct response may be a valid empty search page, but never mistake a
  // shell/challenge for usable content; callers will report zero cards and log
  // the URL and HTML length for provider diagnostics.
  return html && !looksBlocked(html) ? html : "";
}

async function fetchPosts(url: string, providerContext: ProviderContext): Promise<{ posts: Post[]; hasNext: boolean }> {
  const html = await fetchHtml(url, providerContext);
  if (!html) return { posts: [], hasNext: false };
  const $ = providerContext.cheerio.load(html);
  const posts = parseCards($, url);
  const hasNext = $('a[rel="next"], .pagination a.next, a.next.page-numbers').length > 0;
  console.log("Multimovies catalog result:", {
    url,
    cards: posts.length,
    htmlLength: html.length,
    saveTitleNodes: $("[data-save-title]").length,
    posterCards: $("article.poster-card, .poster-card").length,
    titleLinks: $("a[href]").length,
    blocked: looksBlocked(html),
  });
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
  // The live site exposes its search at /search?q=..., not WordPress's ?s=.
  const url = new URL("/search", BASE_URL);
  url.searchParams.set("q", searchQuery.trim());
  if (page > 1) url.searchParams.set("page", String(page));
  const result = await fetchPosts(url.href, providerContext);
  return result.posts;
};
