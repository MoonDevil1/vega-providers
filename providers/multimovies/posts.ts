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
  const cardSelector = "article, li, .poster-card, .movie-card, .movie-item, .film-item, .flw-item, .result-item, .item, .card, .post, .search-item";
  const imageAttrs = [
    "data-src", "data-lazy-src", "data-original", "data-image",
    "data-poster", "data-poster-url", "data-lazy", "data-thumb",
    "data-cover", "data-url", "src", "srcset", "data-srcset"
  ];

  const parsePayload = (raw: string): any => {
    if (!raw) return {};
    const candidates = [raw, raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
    }
    return {};
  };

  const firstString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };

  const add = (scope: any, rawItem?: any) => {
    if (!scope || !scope.length) return;
    const item = rawItem || {};
    const titleLink = (scope.is("a[href]") ? scope : scope.find(
      ".details .title a[href], .data h3 a[href], .entry-title a[href], h1 a[href], h2 a[href], h3 a[href], .title a[href], a[rel='bookmark'], a[href]"
    )).filter((_: number, el: any) => {
      const href = String($(el).attr("href") || "");
      return href && !/^(#|javascript:|mailto:|tel:)/i.test(href);
    }).first();

    const img = scope.is("img, source") ? scope : scope.find("picture img, picture source, img, source").first();
    const caption = scope.find(".title, .name, .entry-title, h1, h2, h3, [class*='title'], [class*='name']").first();
    const title = firstString(
      item.title, item.name, item.label, item.movie_title,
      scope.attr("data-title"), scope.attr("title"),
      titleLink.attr("title"), titleLink.attr("aria-label"),
      caption.text(), img.attr("alt")
    ).replace(/\s+/g, " ");

    const rawHref = firstString(
      item.url, item.link, item.href, item.detail_url, item.detailUrl,
      titleLink.attr("href"), scope.attr("data-href"), scope.attr("data-url")
    );
    const href = abs(rawHref, baseUrl);
    if (!title || !href || seen.has(href)) return;

    let imageRaw = firstString(
      item.poster, item.poster_url, item.posterUrl, item.image, item.image_url,
      item.imageUrl, item.thumbnail, item.thumbnail_url, item.thumb,
      item.cover, item.cover_url, item.backdrop, item.src
    );

    if (!imageRaw) {
      for (const attr of imageAttrs) {
        const value = img.attr(attr);
        if (typeof value !== "string" || !value.trim()) continue;
        const candidate = attr.includes("srcset") ? value.split(",")[0].trim().split(/\s+/)[0] : value.trim();
        if (/^(data:|about:blank|#)/i.test(candidate) ||
            /(placeholder|no[-_]?image|blank\.gif|transparent\.png|loading)/i.test(candidate)) continue;
        imageRaw = candidate;
        break;
      }
    }

    if (!imageRaw) {
      imageRaw = firstString(
        scope.attr("data-poster"), scope.attr("data-poster-url"),
        scope.attr("data-image"), scope.attr("data-src"), scope.attr("data-thumb"),
        scope.find("[data-poster]").first().attr("data-poster"),
        scope.find("[data-image]").first().attr("data-image"),
        scope.find("[data-src]").first().attr("data-src")
      );
    }
    if (!imageRaw) {
      const styled = String(scope.attr("style") || scope.find("[style*='background']").first().attr("style") || "")
        .match(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (styled?.[1]) imageRaw = styled[1];
    }

    const image = abs(imageRaw, baseUrl);
    if (!/^https?:$/i.test(new URL(href).protocol)) return;
    // Do not emit entries without a usable poster: Vega renders those as blank
    // skeleton cards, which looks like a successful catalog response to users.
    if (!image || !/^https?:$/i.test(new URL(image).protocol)) return;

    seen.add(href);
    out.push({ title, link: href, image, provider: "multimovies" });
  };

  // data-save-title is sometimes attached to a small control nested inside the
  // poster card, not to the card itself. Read its JSON but parse the enclosing
  // card so title links and lazy-loaded poster images stay associated.
  $("[data-save-title]").each((_: number, el: any) => {
    const node = $(el);
    const raw = node.attr("data-save-title") || "";
    const card = node.closest(cardSelector);
    add(card.length ? card : node, parsePayload(raw));
  });

  // Support common card layouts used by the site's older and newer themes.
  const selectors = [
    "article.poster-card", ".poster-card", ".movie-card", ".movie-item",
    ".film-item", ".result-item", ".items article", "#archive-content article",
    "article.item", ".search-item", ".flw-item", ".item", ".card"
  ];
  $(selectors.join(", ")).each((_: number, el: any) => {
    const scope = $(el);
    const raw = scope.attr("data-save-title") ||
      scope.find("[data-save-title]").first().attr("data-save-title") || "";
    add(scope, parsePayload(raw));
  });

  // Last-resort parser for simple grids and anchor-wrapped posters.
  if (!out.length) {
    $("a[href] img, article img, .items img, .grid img, img").each((_: number, el: any) => {
      const node = $(el);
      const scope = node.closest(cardSelector);
      add(scope.length ? scope : node.closest("a[href]"), undefined);
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
function hasCatalogCards(html: string, providerContext: ProviderContext, baseUrl = BASE_URL): boolean {
  if (!html || looksBlocked(html)) return false;
  try {
    const $ = providerContext.cheerio.load(html);
    return parseCards($, baseUrl).length > 0;
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
    // A saved cookie jar that no longer produces catalog cards is stale. Clear
    // it so the persisted prompt cooldown cannot strand the provider on a blank page.
    if (hasCatalogCards(html, providerContext, url)) return html;
    if (cookies) {
      cookies = "";
      cachedSession = null;
      try { await kvStore.set(COOKIE_STORE_KEY, { cookies: "", userAgent }); } catch {}
    }
  } catch (error) {
    console.warn("Multimovies direct request failed.", error);
    // A request error with a saved cookie jar should also allow a fresh verify.
    if (cookies) {
      cookies = "";
      cachedSession = null;
      try { await kvStore.set(COOKIE_STORE_KEY, { cookies: "", userAgent }); } catch {}
    }
  }

  // The cooldown only suppresses another prompt while a reusable cookie session
  // exists. If the session was rejected or expired, let the user verify again.
  let lastVerificationAt = 0;
  try {
    const stored = await kvStore.get<number>(VERIFY_COOLDOWN_KEY);
    if (typeof stored === "number") lastVerificationAt = stored;
  } catch {}
  const cooldownActive = Boolean(cookies) && Date.now() - lastVerificationAt < VERIFY_COOLDOWN_MS;

  if (!verificationInFlight && !verificationAttempted && !cooldownActive) {
    verificationAttempted = true;
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
          if (hasCatalogCards(result.data, providerContext, url)) {
            try { await kvStore.set(VERIFY_COOLDOWN_KEY, Date.now()); } catch {}
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
