import { ProviderContext, Post } from "../types";

export const BASE = "https://livetgtv.lovable.app";
const HEADERS = { Accept: "application/json", Referer: BASE + "/" };

export function unwrapChannels(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const value of [payload?.channels, payload?.data?.channels, payload?.data, payload?.items, payload?.results]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function channelId(channel: any): string {
  return String(channel?.id ?? channel?.channelId ?? channel?.channel_id ?? channel?.slug ?? "").trim();
}

export function toPost(channel: any): Post | null {
  const id = channelId(channel);
  const title = String(channel?.name ?? channel?.title ?? channel?.channel_name ?? "").trim();
  if (!id || !title) return null;
  const image = String(channel?.logoUrl ?? channel?.logo_url ?? channel?.logo ?? channel?.image ?? channel?.thumbnail ?? "");
  return { title, link: "tgtv:" + encodeURIComponent(id), image };
}

export function idFromLink(link: string): string {
  if (!link.startsWith("tgtv:")) throw new Error("Unsupported LiveTGTV link");
  const id = decodeURIComponent(link.slice(5));
  if (!id || id.includes("/") || id.includes("..")) throw new Error("Invalid channel id");
  return id;
}

export async function listChannels(ctx: ProviderContext, signal?: AbortSignal): Promise<any[]> {
  const response = await ctx.axios.get(BASE + "/api/public/channels", { headers: HEADERS, timeout: 15000, signal });
  return unwrapChannels(response.data);
}

export async function getChannel(ctx: ProviderContext, id: string, signal?: AbortSignal): Promise<any> {
  const response = await ctx.axios.get(BASE + "/api/public/channels/" + encodeURIComponent(id), {
    headers: HEADERS, timeout: 15000, signal
  });
  return response.data?.channel ?? response.data?.data?.channel ?? response.data?.data ?? response.data;
}
