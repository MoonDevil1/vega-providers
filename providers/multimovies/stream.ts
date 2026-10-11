// providers/multimovies/stream.ts
import { Stream, TextTracks, ProviderContext } from "../types";

import { BASE_URL, fetchHtml } from "./http";

// Normalize escaped media URLs commonly embedded in player configuration.
function cleanMediaUrl(value: string): string {
return value.trim()
.replace(/&amp;/g, "&")
.replace(/\\\//g, "/")
.replace(/\\u0026/gi, "&")
.replace(/\\u003d/gi, "=")
.replace(/[),;]+$/g, "");
}

// Read direct HLS/MP4/WebM sources from both script text and standard media tags.
function extractMediaUrls(html: string, $: any): string[] {
const found = new Set<string>();
const add = (value: unknown) => {
if (typeof value !== "string" || !value.trim()) return;
const url = cleanMediaUrl(value);
if (/^https?:\/\//i.test(url) && /\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(url)) {
found.add(url);
}
};

const normalized = cleanMediaUrl(html);
const matches = normalized.match(/https?:\/\/[^"'\s<>]+?\.(?:m3u8|mp4|webm)(?:\?[^"'\s<>]*)?/gi) || [];
for (const value of matches) add(value);

if ($) {
$("video[src], video source[src], video source[data-src], source[src], source[data-src], [data-hls], [data-file]").each((_: number, el: any) => {
const node = $(el);
add(node.attr("src"));
add(node.attr("data-src"));
add(node.attr("data-hls"));
add(node.attr("data-file"));
});
}
return Array.from(found);
}

// Helper to parse the watch config (matches your Kotlin parseWatchConfig)
function extractObject(html: string, marker: string): string {
const markerIndex = html.indexOf(marker);
if (markerIndex < 0) return "";
const start = html.indexOf("{", markerIndex + marker.length);
if (start < 0) return "";
let depth = 0;
let inString = false;
let escaped = false;
for (let i = start; i < html.length; i++) {
const ch = html[i];
if (escaped) { escaped = false; continue; }
if (ch === "\\" && inString) { escaped = true; continue; }
if (ch === '"') { inString = !inString; continue; }
if (!inString && ch === "{") depth++;
if (!inString && ch === "}" && --depth === 0) return html.slice(start, i + 1);
}
return "";
}

function parseWatchConfig(html: string): { id: string; name: string; url: string }[] {
const servers: { id: string; name: string; url: string }[] = [];
const assignment = /(?:const|let|var)\s+watchConfig\s*=\s*/.exec(html);
const raw = assignment ? extractObject(html, assignment[0]) : "";
if (!raw) return servers;
try {
const config = JSON.parse(raw);
if (Array.isArray(config.initialServers)) {
for (const server of config.initialServers) {
if (typeof server?.url === "string" && server.url.trim()) {
servers.push({
id: String(server.id || ""),
name: String(server.name || server.id || "Server"),
url: server.url,
});
}
}
}
} catch (error) {
console.error("Multimovies watchConfig parse error", error);
}
return servers;
}

// Helper to extract IDs from server URLs (matches your Kotlin extractIds)
function extractIds(servers: { url: string }[]): { tmdbId?: string; imdbId?: string } {
let tmdbId: string | undefined;
let imdbId: string | undefined;
for (const s of servers) {
if (!tmdbId) {
const m = s.url.match(/(?:movie\?id=|watch\/movie\/|watch\/tv\/|embed\/tmdb\/tv\?id=|\/tv\/)(\d+)/);
if (m) tmdbId = m[1];
}
if (!imdbId) {
const m = s.url.match(/(tt\d{6,})/);
if (m) imdbId = m[1];
}
}
return { tmdbId, imdbId };
}

export const getStream = async function ({
link,
type,
providerContext,
signal,
}: {
link: string;
type: string;
providerContext: ProviderContext;
signal?: AbortSignal;
}): Promise<Stream[]> {
const { cheerio } = providerContext;
// Carry cancellation and bound each host request. No site cookies go here.
const axios = {
get: (url: string, options: any = {}) => providerContext.axios.get(url, { timeout: 15000, ...options, signal }),
post: (url: string, data: any, options: any = {}) => providerContext.axios.post(url, data, { timeout: 15000, ...options, signal }),
};
const streams: Stream[] = [];
const subtitles: TextTracks = [];

try {
const direct = new URL(cleanMediaUrl(link), BASE_URL).href;
const pathname = new URL(direct, BASE_URL).pathname;
const extension = pathname.match(/\.(m3u8|mp4|webm)$/i)?.[1]?.toLowerCase();
if (extension && /^https?:\/\//i.test(direct)) {
return [{
server: "Direct Link",
link: direct,
type: extension,
headers: { Referer: new URL(direct, BASE_URL).origin + "/" },
subtitles,
}];
}
} catch { /* continue with the watch page */ }


try {
// 1. Fetch the watch page and parse the server list
const html = await fetchHtml(link, providerContext, signal);
const servers = parseWatchConfig(html);

// 2. If no servers, fall back to a generic m3u8 grep on the page
if (servers.length === 0) {
const $ = cheerio.load(html);
const referer = (() => {
try { return new URL(link, BASE_URL).origin + "/"; }
catch { return BASE_URL + "/"; }
})();
for (const mediaUrl of extractMediaUrls(html, $)) {
const extension = new URL(mediaUrl).pathname.match(/\.(m3u8|mp4|webm)$/i)?.[1]?.toLowerCase() || "m3u8";
streams.push({ server: "Generic", link: mediaUrl, type: extension, headers: { Referer: referer } });
}
if (!streams.length) throw new Error("No playable media found on the Multimovies watch page");
return streams.map(stream => ({ ...stream, subtitles }));

}

// 3. Extract IDs and media details
const { tmdbId, imdbId } = extractIds(servers);
const $ = cheerio.load(html);
const title = $("h1").first().text().trim() || "";
const yearMatch = $(".cinejoy-meta-pill").text().match(/\b((?:19|20)\d{2})\b/);
const year = yearMatch ? yearMatch[1] : undefined;

const path = new URL(link).pathname;
const isTv = /series|episode|\/tv\//i.test(type + " " + path);
const seasonMatch = path.match(/\/season\/(\d+)\/episode\//i) || path.match(/season[-_/ ]?(\d+).*episode/i) || path.match(/\bs(\d+)e\d+\b/i);
const episodeMatch = path.match(/\/season\/\d+\/episode\/(\d+)/i) || path.match(/episode[-_/ ]?(\d+)/i) || path.match(/\bs\d+e(\d+)\b/i);
const season = seasonMatch ? parseInt(seasonMatch[1], 10) : undefined;
const episode = episodeMatch ? parseInt(episodeMatch[1], 10) : undefined;


// 4. Resolve each server (adapted from your Kotlin resolveServer)
const promises = servers.map(async (server) => {
const streams: Stream[] = [];
try {
server.url = new URL(cleanMediaUrl(server.url), BASE_URL).href;
const host = new URL(server.url).hostname.toLowerCase();
if (/\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(server.url)) {
return [{ server: server.name, link: server.url,
  type: new URL(server.url).pathname.split(".").pop() || "m3u8",
  headers: { Referer: link } }];
}
// --- Vidout ---
if (host.includes("vidout.pages.dev") && tmdbId) {
const raw = "https://raw.githubusercontent.com/Watchout2025/api/refs/heads/main";
if (!isTv) {
const { data: url } = await axios.get(`${raw}/hls/movie/${tmdbId}`, {
headers: { Referer: "https://vidout.pages.dev/" },
});
if (url && url.startsWith("http")) {
streams.push({ server: server.name, link: url.trim(), type: "m3u8", headers: { Referer: "https://vidout.pages.dev/" } });
}
// Subtitles
try {
const { data: subsBody } = await axios.get(`${raw}/sub/movie/${tmdbId}/subtitles.json`);
const subs = subsBody.subtitles;
if (subs) {
for (const [lang, subUrl] of Object.entries(subs)) {
if (subUrl) subtitles.push({
title: lang,
language: lang as any,
type: "text/vtt",
uri: subUrl as string,
});
}
}
} catch { /* ignore */ }
} else if (season && episode) {
const { data: body } = await axios.get(`${raw}/hls/tv/${tmdbId}/S${season}.json`, {
headers: { Referer: "https://vidout.pages.dev/" },
});
const map = typeof body === "string" ? JSON.parse(body) : body;
const url = map[episode.toString()];
if (url && url.startsWith("http")) {
streams.push({ server: server.name, link: url, type: "m3u8", headers: { Referer: "https://vidout.pages.dev/" } });
}
}
}

// --- Vidsync ---
if (host.includes("vidsync.pro")) {
const resolvedUrl = tmdbId ? server.url.replace("{tmdbId}", tmdbId) : server.url;
const { data: syncHtml } = await axios.get(resolvedUrl, {
headers: { Referer: "https://multimovies.garden/" },
});
const m3u8s = syncHtml.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g) || [];
for (const u of m3u8s) {
streams.push({ server: server.name, link: u.replace(/\\\//g, "/"), type: "m3u8" });
}
}

// --- Bingr ---
if (host.includes("bingr.one") && tmdbId) {
const api = "https://api.bingr.one";
const srvList = [
{ id: "s40", name: "Aphelion" },
{ id: "s70", name: "Polaris" },
{ id: "s62", name: "Bastion" },
{ id: "s63", name: "Hallyu" },
{ id: "s30", name: "Nova" },
{ id: "s60", name: "Vertex" },
{ id: "s61", name: "Corvus" },
{ id: "s31", name: "Orion" },
{ id: "s3", name: "Edmunds" },
];
await Promise.all(srvList.map(async (srv) => {
try {
let body: any;
if (srv.id === "s40" && isTv && season && episode) {
const { data } = await axios.get(`${api}/stream/aphelion-tv/${tmdbId}/${season}/${episode}`, {
headers: { Referer: "https://bingr.one/" },
});
body = data;
} else {
const query: any = { title };
if (year) query.year = year;
if (isTv && season) query.season = season;
if (isTv && episode) query.episode = episode;
const payload = { srv: srv.id, t: isTv ? "tv" : "movie", id: tmdbId, query };
const { data } = await axios.post(`${api}/stream`, payload, {
headers: { Referer: "https://bingr.one/", Origin: "https://bingr.one" },
});
body = data;
}
if (body && body.sources) {
for (const src of body.sources) {
if (src.url) {
streams.push({
server: `${server.name} ${srv.name}`,
link: src.url,
type: "m3u8",
quality: src.quality || "HD",
});
}
}
if (body.subtitles) {
for (const sub of body.subtitles) {
if (sub.url) subtitles.push({
title: sub.label || sub.lang || "en",
language: sub.lang || "en",
type: "text/vtt",
uri: sub.url,
});
}
}
}
} catch (error) {
console.warn(`Multimovies ${srv.name} unavailable`, error);
}
}));
}

// --- Filmu ---
if (host.includes("filmu.in") && tmdbId && (!isTv || (season && episode))) {
const host2 = "https://embed.filmu.in";
const path = isTv
? `${host2}/api/singularity-tv?tmdb=${tmdbId}&s=${season}&e=${episode}`
: `${host2}/api/singularity-movie?id=${tmdbId}`;
const { data: body } = await axios.get(path, {
headers: { Referer: `${host2}/` },
});
if (body.sources) {
const base = body._base || "";
for (const src of body.sources) {
let url = src.url;
if (!url.startsWith("http") && base) url = new URL(url, base).href;
if (url.startsWith("http")) {
streams.push({
server: server.name,
link: url,
type: "m3u8",
quality: src.quality || "1080p",
});
}
}
if (body.subtitles) {
for (const sub of body.subtitles) {
if (sub.url) subtitles.push({
title: sub.lang || "en",
language: sub.lang || "en",
type: "text/vtt",
uri: sub.url,
});
}
}
}
}

// --- Fallback: Generic m3u8 extraction ---
if (streams.length === 0) {
const { data: pageHtml } = await axios.get(server.url, {
headers: { Referer: "https://multimovies.garden/" },
});
const page$ = cheerio.load(typeof pageHtml === "string" ? pageHtml : "");
const referer = (() => {
try { return new URL(server.url, BASE_URL).origin + "/"; }
catch { return BASE_URL + "/"; }
})();
for (const mediaUrl of extractMediaUrls(typeof pageHtml === "string" ? pageHtml : "", page$)) {
const extension = new URL(mediaUrl).pathname.match(/\.(m3u8|mp4|webm)$/i)?.[1]?.toLowerCase() || "m3u8";
streams.push({ server: server.name, link: mediaUrl, type: extension, headers: { Referer: referer } });
}
}

} catch (e) {
console.error(`Error resolving ${server.name}`, e);
}
return streams;
});

streams.push(...(await Promise.all(promises)).flat());

} catch (e) {
throw e;
}

const uniqueStreams = new Map<string, Stream>();
for (const stream of streams) {
if (stream.link && !uniqueStreams.has(stream.link)) uniqueStreams.set(stream.link, stream);
}
const uniqueSubtitles = new Map<string, TextTracks[number]>();
for (const subtitle of subtitles) {
if (subtitle.uri && !uniqueSubtitles.has(subtitle.uri)) uniqueSubtitles.set(subtitle.uri, subtitle);
}
if (!uniqueStreams.size) throw new Error("No supported Multimovies server returned playable media");
return Array.from(uniqueStreams.values()).map(stream => ({ ...stream, subtitles: Array.from(uniqueSubtitles.values()) }));
};
