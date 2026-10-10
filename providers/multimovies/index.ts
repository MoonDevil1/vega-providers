import { ProviderType } from "../types";
import { catalog, genres } from "./catalog";
import { getPosts, getSearchPosts } from "./posts";
import { getMeta } from "./meta";
import { getEpisodeLinks } from "./episodes";
import { getStream } from "./stream";

const multimovies: ProviderType = {
  catalog,
  genres,

  GetHomePosts: async ({ filter, page, signal, providerContext }) =>
    getPosts({ filter, page, signal, providerContext }),

  GetSearchPosts: async ({ searchQuery, page, signal, providerContext }) =>
    getSearchPosts({ searchQuery, page, signal, providerContext }),

  GetMetaData: async ({ link, providerContext }) =>
    getMeta({ link, providerContext }),

  GetEpisodeLinks: async ({ url, providerContext }) =>
    getEpisodeLinks({ url, providerContext }),

  GetStream: async ({ link, type, providerContext }) => {
    const { streams, subtitles } = await getStream({ link, type, providerContext });
    return streams.map((stream) => ({ ...stream, subtitles }));
  },
};

export default multimovies;
