import { Info, ProviderContext } from "../types";
import { loadChannels, channelKey } from "./channels";

export async function getMeta({link, providerContext}: {link: string; providerContext: ProviderContext}): Promise<Info> {
  const channels = await loadChannels(providerContext);
  const channel = channels.find(item => channelKey(item) === link || item.link === link || item.stream === link);
  return {
    title: channel?.title || "Live TV",
    image: channel?.image || "",
    synopsis: channel ? "Live television • " + channel.category : "Live television",
    imdbId: "",
    type: "movie",
    linkList: [{
      title: "Watch Live",
      directLinks: [{title: "Watch Live", link: channel?.stream || channel?.link || link, type: "movie"}]
    }]
  };
}
