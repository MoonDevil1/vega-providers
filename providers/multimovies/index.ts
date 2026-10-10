import { ProviderType } from '../types';
import { catalog, genres } from './catalog';
import { getPosts, getSearchPosts } from './posts';
import { getMeta } from './meta';
import { getStream } from './stream';

const multimovies: ProviderType = {
  catalog,
    genres,

      GetHomePosts: async ({ filter, page, providerContext }) => {
          const { posts } = await getPosts({ filter, page, providerContext });
              return posts;
                },

                  GetSearchPosts: async ({ searchQuery, providerContext }) => {
                      const { posts } = await getSearchPosts({ searchQuery, providerContext });
                          return posts;
                            },

                              GetMetaData: async ({ link, providerContext }) => {
                                  return await getMeta({ link, providerContext });
                                    },

                                      GetStream: async ({ link, type, providerContext }) => {
                                          const { streams, subtitles } = await getStream({ link, type, providerContext });
                                              // Attach subtitles to each stream so the app can display them
                                                  return streams.map(s => ({ ...s, subtitles }));
                                                    },
                                                    };

                                                    export default multimovies;