import { ProviderType } from "../types";
import { catalog, genres } from "./catalog";
import { getPosts, getSearchPosts } from "./posts";
import { getMeta } from "./meta";
import { getStream } from "./stream";
import { getEpisodes } from "./episodes";

const ogpiratebot: ProviderType = {
  catalog, genres,
  GetHomePosts: ({filter,page,signal,providerContext}) => getPosts({filter,page,signal,providerContext}),
  GetSearchPosts: ({searchQuery,page,signal,providerContext}) => getSearchPosts({searchQuery,page,signal,providerContext}),
  GetMetaData: ({link,providerContext}) => getMeta({link,providerContext}),
  GetEpisodeLinks: () => getEpisodes(),
  GetStream: ({link,type,providerContext,signal}) => getStream({link,type,providerContext,signal})
};
export default ogpiratebot;
