import { ProviderContext, Stream } from "../types";
import { getChannel, idFromLink } from "./api";

function sourceUrls(data: any): string[] {
  const sources = [data?.stream, data?.streamUrl, data?.hlsUrl, data?.mpdUrl, data?.url, data?.sources, data?.streams];
  const out: string[] = [];
  const add = (value: any) => {
    if (typeof value === "string") out.push(value);
    else if (value && typeof value === "object") {
      for (const field of ["url", "link", "src", "streamUrl", "mpdUrl", "hlsUrl"]) {
        if (typeof value[field] === "string") out.push(value[field]);
      }
    }
  };
  for (const value of sources) Array.isArray(value) ? value.forEach(add) : add(value);
  return [...new Set(out)];
}

function safeHttpUrl(input: string): boolean {
  try { const u = new URL(input); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

export async function getStream({ link, signal, providerContext }: {
  link: string; type?: string; signal?: AbortSignal; providerContext: ProviderContext; isDownload?: boolean;
}): Promise<Stream[]> {
  // Fetch fresh V1 playback information on every play (don't cache signed URLs).
  const channel = await getChannel(providerContext, idFromLink(link), signal);
  const urls = sourceUrls(channel);
  const streams: Stream[] = [];
  // License-server URLs must be issued by the V1 service for this playback.
  // Key IDs or raw decryption keys are not copied into URLs or logs.
  const licenseServer = String(
    channel?.drm?.licenseServer ?? channel?.drm?.licenseUrl ??
    channel?.licenseServer ?? ""
  );
  const drmType = String(channel?.drm?.type ?? "").toLowerCase();
  const drm = /^https:\/\//i.test(licenseServer) &&
    ["clearkey", "widevine", "playready"].includes(drmType)
      ? { type: drmType, licenseServer } : undefined;
  const requestedHeaders = channel?.headers ?? channel?.requestHeaders;
  const headers = requestedHeaders && typeof requestedHeaders === "object" &&
    !Array.isArray(requestedHeaders)
      ? Object.fromEntries(Object.entries(requestedHeaders).filter(
          ([key, value]) => typeof value === "string" && !/[\r\n]/.test(key + value)
        ))
      : undefined;
  for (const url of urls) {
    if (!safeHttpUrl(url)) continue;
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".m3u8")) {
      streams.push({ server: "LiveTGTV V1", link: url, type: "m3u8", quality: "auto", ...(headers ? { headers } : {}) });
    } else if (pathname.endsWith(".mpd")) {
      streams.push({ server: "LiveTGTV V1 (DASH)", link: url, type: "mpd", quality: "auto", ...(headers ? { headers } : {}), ...(drm ? { drm } : {}) } as Stream);
    } else if (pathname.endsWith(".mp4")) {
      streams.push({ server: "LiveTGTV V1", link: url, type: "mp4", quality: "auto" });
    }
  }
  // Vega Player.tsx accepts type "mpd". Encrypted sources still need authorized DRM support.
  return streams;
}
