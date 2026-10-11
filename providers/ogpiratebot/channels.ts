import { ProviderContext } from "../types";

export const SITE = "https://theogpiratebot.online";
const PAGE = SITE + "/live-tv";

export interface Channel {
  title: string;
  link: string;
  image: string;
  category: string;
  stream?: string;
}

function safeUrl(value: unknown, base: string): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim(), base);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function first(obj: any, keys: string[]): string {
  for (const key of keys) {
    const val = obj?.[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function isStream(url: string): boolean {
  return /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url);
}

function fromRecord(record: any): Channel | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const title = first(record, ["name", "title", "channelName", "channel_name", "label"]);
  if (!title) return null;
  const stream = safeUrl(first(record, ["stream_url", "streamUrl", "stream", "m3u8", "playbackUrl", "playback_url", "url"]), PAGE);
  const link = safeUrl(first(record, ["pageUrl", "page_url", "watchUrl", "watch_url", "href", "link"]), PAGE);
  const image = safeUrl(first(record, ["logo", "logoUrl", "logo_url", "image", "poster", "thumbnail"]), PAGE);
  const category = first(record, ["category", "genre", "group", "group_title", "type"]) || "Live TV";
  // A stream URL is accepted only when the record explicitly supplies it.
  return { title, link: link || stream || PAGE, image, category, stream: stream || undefined };
}

function collectRecords(root: any): Channel[] {
  const out: Channel[] = [];
  const seen = new Set<any>();
  function scan(v: any, depth: number) {
    if (!v || typeof v !== "object" || depth > 9 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 3000)) scan(item, depth + 1);
      return;
    }
    const obj = fromRecord(v);
    if (obj) out.push(obj);
    for (const [key, val] of Object.entries(v)) {
      if (/^(channels?|items?|data|results?|groups?|categories|liveTv|live_tv|props|pageProps|initialState|state)$/i.test(key)) scan(val, depth + 1);
    }
  }
  scan(root, 0);
  return out;
}

function parseHtml(html: string, context: ProviderContext): Channel[] {
  const $ = context.cheerio.load(html);
  const results: Channel[] = [];

  // Embedded application data (when present) is preferred over guesswork about endpoints.
  for (const el of $("script[type='application/json'],script#__NEXT_DATA__").toArray()) {
    const raw = $(el).html() || "";
    try { results.push(...collectRecords(JSON.parse(raw))); } catch {}
  }

  const candidates = $("[data-channel-name], [data-stream-url], [data-stream], article, .channel-card, .channel-item, .tv-channel, .channel");
  candidates.each((_, node) => {
    const card = $(node);
    const title = (card.attr("data-channel-name") || card.find(".channel-name, .channel-title, h2, h3, h4").first().text() || card.find("img").first().attr("alt") || "").trim();
    if (!title) return;
    const rawStream = card.attr("data-stream-url") || card.attr("data-stream") || card.find("video source").first().attr("src") || "";
    const stream = safeUrl(rawStream, PAGE);
    const link = safeUrl(card.find("a[href]").first().attr("href"), PAGE) || stream || PAGE;
    const image = safeUrl(card.find("img").first().attr("data-src") || card.find("img").first().attr("src"), PAGE);
    const category = (card.attr("data-category") || card.find(".category, .channel-category").first().text() || "Live TV").trim();
    results.push({ title, link, image, category, stream: stream || undefined });
  });
  return results;
}

export async function loadChannels(context: ProviderContext, signal?: AbortSignal): Promise<Channel[]> {
  const response = await context.axios.get(PAGE, {
    headers: { ...context.commonHeaders, Accept: "text/html,application/xhtml+xml,application/json" },
    signal, timeout: 20000
  });
  const raw = response.data;
  const candidates = typeof raw === "string" ? parseHtml(raw, context) : collectRecords(raw);
  const unique = new Map<string, Channel>();
  for (const candidate of candidates) {
    const key = (candidate.title + "|" + (candidate.stream || candidate.link)).toLowerCase();
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

export function streamType(url: string): string {
  return /\.mp4(?:[?#]|$)/i.test(url) ? "mp4" : /\.m3u8(?:[?#]|$)/i.test(url) ? "m3u8" : "iframe";
}

export function directStream(url: string): boolean {
  return isStream(url);
}

export function channelKey(channel: Channel): string {
  return channel.link !== PAGE ? channel.link : channel.stream || channel.title;
}
