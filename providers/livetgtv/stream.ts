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
  for (const url of urls) {
    if (!safeHttpUrl(url)) continue;
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".m3u8")) {
      streams.push({ server: "LiveTGTV V1", link: url, type: "m3u8", quality: "auto" });
    } else if (pathname.endsWith(".mp4")) {
      streams.push({ server: "LiveTGTV V1", link: url, type: "mp4", quality: "auto" });
    }
  }
  if (!streams.length && urls.some(url => /\.mpd(?:\?|$)/i.test(url))) {
    // DASH+ClearKey needs a DRM-capable Vega player or an explicitly authorized playback service.
    // Never relabel an MPD as HLS or leak DRM keys in a proxy URL.
    console.warn("[LiveTGTV V1] DASH playback requires supported DRM integration; no HLS source provided");
  }
  return streams;
}
