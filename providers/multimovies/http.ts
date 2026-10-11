import { ProviderContext } from "../types";

export const BASE_URL = "https://multimovies.garden";
const SESSION_KEY = "multimovies.session.v2";
const ATTEMPT_KEY = "multimovies.verification.v2";
const RETRY_DELAY = 30_000;
// Native HTTP can take 30s per request; leave room in Vega's 120s invocation.
const VERIFICATION_TIMEOUT = 50_000;
type Session = { origin: string; cookies: string; userAgent: string };
type Attempt = { at: number; pending: boolean };

export function isChallenge(html: string): boolean {
  return /cf-chl-|challenge-platform|checking your browser|<title[^>]*>\s*(?:just a moment|attention required)|ddos-guard/i.test(html);
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Multimovies request cancelled");
}

// All site modules use the same UA/session. Module globals do not survive a
// Vega invocation; kvStore does. Never send site cookies to an embed/CDN host.
export async function fetchHtml(url: string, context: ProviderContext, signal?: AbortSignal): Promise<string> {
  const origin = new URL(url).origin;
  if (origin !== BASE_URL) throw new Error("Unexpected Multimovies page origin");
  const key = SESSION_KEY + origin;
  const attemptKey = ATTEMPT_KEY + origin;
  const readSession = async () => {
    const value = await context.kvStore.get<Session>(key);
    return value?.origin === origin ? value : undefined;
  };
  let session = await readSession();
  const headers = () => ({
    ...context.commonHeaders,
    "User-Agent": session?.userAgent || context.commonHeaders["User-Agent"] ||
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE_URL + "/",
    ...(session?.cookies ? { Cookie: session.cookies } : {}),
  });
  const request = async (): Promise<string | null> => {
    checkAbort(signal);
    try {
      const response = await context.axios.get(url, { headers: headers(), signal, timeout: 20000 });
      const html = typeof response.data === "string" ? response.data : "";
      if (isChallenge(html)) return null;
      if (!html) throw new Error("Multimovies returned an empty page");
      return html;
    } catch (error: any) {
      checkAbort(signal);
      const body = error?.response?.data;
      if ((typeof body === "string" && isChallenge(body)) ||
          error?.response?.headers?.["cf-mitigated"] === "challenge") return null;
      // Network errors, 404s and empty searches are not verification requests.
      throw error;
    }
  };
  const html = await request();
  if (html !== null) return html;

  let attempt = await context.kvStore.get<Attempt>(attemptKey);
  // Another sandbox invocation may already be waiting for the user.
  const deadline = Date.now() + VERIFICATION_TIMEOUT;
  let waited = false;
  while (attempt?.pending && Date.now() - attempt.at < VERIFICATION_TIMEOUT && Date.now() < deadline) {
    waited = true;
    checkAbort(signal);
    await new Promise(resolve => setTimeout(resolve, 200));
    attempt = await context.kvStore.get<Attempt>(attemptKey);
  }
  if (waited && attempt?.pending) throw new Error("Multimovies verification timed out. Please retry.");
  const latest = await readSession();
  if (latest && (latest.cookies !== session?.cookies || latest.userAgent !== session?.userAgent)) {
    session = latest;
    const retried = await request();
    if (retried !== null) return retried;
  }
  if (attempt && Date.now() - attempt.at < RETRY_DELAY) {
    throw new Error("Multimovies verification did not unlock this request. Please retry shortly.");
  }
  await context.kvStore.set(attemptKey, { at: Date.now(), pending: true });
  try {
    const result = await context.openWebView(url, {
      title: "Verify Multimovies",
      description: "Complete verification. Vega will reuse this session.",
      headers: headers(), waitForCookie: "cf_clearance", force: true, timeoutMs: VERIFICATION_TIMEOUT,
    });
    const resultOrigin = new URL(result.url || url).origin;
    if (resultOrigin !== origin) throw new Error("Verification returned a different site");
    session = {
      origin,
      cookies: result.cookies || Object.entries(result.cookieMap || {}).map(([k, v]) => `${k}=${v}`).join("; "),
      userAgent: result.userAgent || headers()["User-Agent"],
    };
    await context.kvStore.set(key, session);
    // A coalesced dialog can belong to a different category. Never return its
    // HTML for this URL: that used to display the wrong posters/category.
    if (result.url === url && result.data && !isChallenge(result.data)) return result.data;
    const retried = await request();
    if (retried !== null) return retried;
    throw new Error("Multimovies is still requesting verification");
  } finally {
    await context.kvStore.set(attemptKey, { at: Date.now(), pending: false });
  }
}
