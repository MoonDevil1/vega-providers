import { Stream, ProviderContext } from "../types";

export const getStream = async function ({
  link,
  type,
  signal,
  providerContext,
  isDownload,
}: {
  link: string;
  type: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
  isDownload?: boolean;
}): Promise<Stream[]> {
  const { axios, cheerio, commonHeaders } = providerContext;
  const streams: Stream[] = [];

  try {
    const res = await axios.get(link, {
      headers: {
        ...commonHeaders,
        Referer: link,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      timeout: 10000,
      signal,
    });

    const $ = cheerio.load(res.data);

    // 1. Direct iframes on the page
    $("iframe").each((i, el) => {
      let src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("http")) {
        streams.push({
          server: `Player ${i + 1}`,
          link: src,
          type: src.includes(".m3u8") ? "m3u8" : "mp4",
          quality: "1080",
        });
      }
    });

    // 2. Dooplay player options
    const options = $("#playeroptionsul li");
    for (let idx = 0; idx < options.length; idx++) {
      const el = options[idx];
      const post = $(el).attr("data-post");
      const nume = $(el).attr("data-nume");
      const pType = $(el).attr("data-type");
      const serverTitle = $(el).find(".title").text().trim() || `Server ${idx + 1}`;

      if (post && nume && pType) {
        try {
          const origin = new URL(link).origin;
          const ajaxUrl = `${origin}/wp-json/dooplayer/v2/${post}/${pType}/${nume}`;
          const ajaxRes = await axios.get(ajaxUrl, {
            headers: { ...commonHeaders, Referer: link },
            signal,
          });

          let embed = ajaxRes.data?.embed_url;
          if (embed) {
            const frameMatch = embed.match(/src=["']([^"']+)["']/i);
            let embedSrc = frameMatch ? frameMatch[1] : embed;
            if (embedSrc.startsWith("//")) embedSrc = "https:" + embedSrc;
            if (embedSrc.startsWith("http")) {
              streams.push({
                server: serverTitle,
                link: embedSrc,
                type: embedSrc.includes(".m3u8") ? "m3u8" : "mp4",
                quality: "1080",
              });
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  return streams;
};
