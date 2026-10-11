import { ProviderType } from "../types";
import { catalog } from "./catalog";
import { getPosts, getSearchPosts } from "./posts";
import { getMeta } from "./meta";
import { getEpisodes } from "./episodes";
import { getStream } from "./stream";

const multimovies: ProviderType = {
  catalog,
  genres: [],
  GetHomePosts: ({filter,page,signal,providerValue,providerContext}) => getPosts({filter,page,signal,providerValue,providerContext}),
  GetSearchPosts: ({searchQuery,page,signal,providerValue,providerContext}) => getSearchPosts({searchQuery,page,signal,providerValue,providerContext}),
  GetMetaData: ({link,providerContext}) => getMeta({link,providerContext}),
  GetEpisodeLinks: ({url,providerContext}) => getEpisodes({url,providerContext}),
  GetStream: ({link,type,signal,providerContext}) => getStream({link,type,signal: signal || new AbortController().signal,providerContext}),
};
export default multimovies;
