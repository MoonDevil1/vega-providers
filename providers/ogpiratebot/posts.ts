import { Post, ProviderContext } from "../types";
import { loadChannels, channelKey } from "./channels";

export async function getPosts({ filter = "all", page = 1, signal, providerContext }: {
  filter?: string; page?: number; signal?: AbortSignal; providerContext: ProviderContext;
}): Promise<Post[]> {
  const channels = await loadChannels(providerContext, signal);
  const filtered = !filter || filter === "all" ? channels : channels.filter(channel => channel.category.toLowerCase().includes(filter.toLowerCase()));
  const start = (Math.max(1, page) - 1) * 40;
  return filtered.slice(start, start + 40).map(channel => ({
    title: channel.title, link: channelKey(channel), image: channel.image
  }));
}

export async function getSearchPosts({ searchQuery, page = 1, signal, providerContext }: {
  searchQuery: string; page?: number; signal?: AbortSignal; providerContext: ProviderContext;
}): Promise<Post[]> {
  const channels = await loadChannels(providerContext, signal);
  const q = searchQuery.trim().toLowerCase();
  const filtered = channels.filter(channel => channel.title.toLowerCase().includes(q));
  const start = (Math.max(1, page) - 1) * 40;
  return filtered.slice(start, start + 40).map(channel => ({
    title: channel.title, link: channelKey(channel), image: channel.image
  }));
}
