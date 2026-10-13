import { ProviderType } from "../types";
import { catalog, genres } from "./catalog";
import { getPosts, getSearchPosts } from "./posts";
import { getMeta } from "./meta";
import { getStream } from "./stream";

const livetgtv: ProviderType = {
  catalog,
  genres,
  GetHomePosts: getPosts,
  GetSearchPosts: getSearchPosts,
  GetMetaData: ({ link, providerContext }) => getMeta({ link, providerContext }),
  GetStream: getStream
};
export default livetgtv;
