import { Info, ProviderContext } from "../types";
import { getChannel, idFromLink } from "./api";

export async function getMeta({ link, providerContext }: {
  link: string; providerContext: ProviderContext;
}): Promise<Info> {
  const id = idFromLink(link);
  const channel = await getChannel(providerContext, id);
  const title = String(channel?.name ?? channel?.title ?? channel?.channel_name ?? id);
  const image = String(channel?.logoUrl ?? channel?.logo_url ?? channel?.logo ?? channel?.image ?? "");
  return {
    title,
    image,
    synopsis: String(channel?.description ?? "Live television channel"),
    imdbId: "",
    type: "movie", // A live channel is one continuously playable item, not a series.
    linkList: [{
      title: "Watch live",
      directLinks: [{ title: "Live", link, type: "movie" }]
    }]
  };
}
