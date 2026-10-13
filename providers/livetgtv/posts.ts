import { Post, ProviderContext } from "../types";
import { listChannels, toPost } from "./api";

export async function getPosts({ page = 1, providerContext, signal }: {
  filter?: string; page?: number; providerValue?: string; signal?: AbortSignal; providerContext: ProviderContext;
}): Promise<Post[]> {
  if (page > 1) return []; // Listing endpoint pagination not documented/verified.
  const channels = await listChannels(providerContext, signal);
  return channels.map(toPost).filter((item): item is Post => item !== null);
}

export async function getSearchPosts({ searchQuery, page = 1, providerContext, signal }: {
  searchQuery: string; page?: number; providerValue?: string; signal?: AbortSignal; providerContext: ProviderContext;
}): Promise<Post[]> {
  if (page > 1) return [];
  const all = await getPosts({ page: 1, providerContext, signal });
  const needle = searchQuery.trim().toLocaleLowerCase();
  return all.filter(item => item.title.toLocaleLowerCase().includes(needle));
}
