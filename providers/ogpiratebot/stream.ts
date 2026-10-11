import { Stream, ProviderContext } from "../types";
import { loadChannels, channelKey, directStream, streamType, SITE } from "./channels";

export async function getStream({link, providerContext, signal}: {
  link: string; type?: string; signal?: AbortSignal; providerContext: ProviderContext;
}): Promise<Stream[]> {
  const channels = await loadChannels(providerContext, signal);
  const channel = channels.find(item => channelKey(item) === link || item.link === link || item.stream === link);
  const direct = channel?.stream || (directStream(link) ? link : "");
  if (direct && directStream(direct)) return [{
    server: "Live TV", link: direct, type: streamType(direct),
    headers: { Referer: SITE + "/" }
  }];
  // Do not invent stream URLs or mislabel a website as a playable video.
  // An official embed can be returned as an iframe fallback if advertised by the channel record.
  if (channel?.stream && /^https?:\/\//.test(channel.stream)) {
    return [{ server: "Live TV (embed)", link: channel.stream, type: "iframe" }];
  }
  return [];
}
