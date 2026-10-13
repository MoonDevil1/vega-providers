import { ProviderContext } from "../types";

export async function buildMediaFlowUrl(
  ctx: ProviderContext, mpdUrl: string, channel: any
): Promise<string | null> {
  const rawBase = String((await ctx.kvStore.get<string>("mediaflowUrl")) ?? "").trim();
  const password = String((await ctx.kvStore.get<string>("mediaflowPassword")) ?? "");
  // Test fallback: a separately installed proxy on the SAME Android device.
  // This does not start a converter; it only supplies the loopback address.
  const selectedBase = rawBase || "http://127.0.0.1:8888";
  let base: URL;
  try {
    base = new URL(selectedBase);
    // Only a trusted HTTPS deployment, or local machine for development.
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))) return null;
    if (base.username || base.password) return null;
  } catch { return null; }
  // Do not hand Vega an unplayable 127.0.0.1 URL if no service is running.
  try {
    const health = new URL("/health", base);
    const response = await ctx.axios.get(health.toString(), { timeout: 2500 });
    if (response.status !== 200 || response.data?.status !== "ok") {
      console.warn("[LiveTGTV V1] MediaFlow service failed health check");
      return null;
    }
  } catch {
    console.warn("[LiveTGTV V1] No reachable MediaFlow converter at configured address");
    return null;
  }
  const proxy = new URL("/proxy/mpd/manifest.m3u8", base);
  proxy.searchParams.set("d", mpdUrl);
  // Keep live playback behind the live edge to allow segment prebuffering.
  proxy.searchParams.set("start_offset", "-18");
  if (password) proxy.searchParams.set("api_password", password);
  const headers = channel?.headers ?? channel?.requestHeaders;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const key of ["Referer", "Origin", "User-Agent"]) {
      const value = headers[key] ?? headers[key.toLowerCase()];
      if (typeof value === "string" && !/[\r\n]/.test(value)) {
        proxy.searchParams.set("h_" + key.toLowerCase(), value);
      }
    }
  }
  // Only use explicitly supplied V1 ClearKey values. Never guess keys or
  // attempt to defeat a license/authorization system.
  const drm = channel?.drm;
  const drmType = String(drm?.type ?? "").toLowerCase();
  const keyId = drm?.keyId ?? drm?.key_id;
  const key = drm?.key;
  if ((!drmType || drmType === "clearkey") && typeof keyId === "string" && typeof key === "string" && keyId && key) {
    // MediaFlow needs these values for permitted ClearKey remuxing.
    // WARNING: proxy URLs contain short-lived sensitive parameters.
    proxy.searchParams.set("key_id", keyId);
    proxy.searchParams.set("key", key);
  } else if (drm && (drmType === "clearkey" || drmType === "widevine" || drmType === "playready")) {
    return null; // No suitable authorized key material for proxy conversion.
  }
  return proxy.toString();
}
