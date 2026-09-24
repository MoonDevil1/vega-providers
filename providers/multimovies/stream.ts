import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://multimovies.tax";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: BASE_URL,
};

export const getStream = async ({
  link,
  signal,
}: {
  link: string;
  type?: string;
  signal?: AbortSignal;
  providerContext?: any;
  isDownload?: boolean;
}) => {
  try {
    const response = await axios.get(link, { headers, signal });
    const $ = cheerio.load(response.data);
    const streams: Array<{
      server: string;
      link: string;
      type: string;
      headers?: Record<string, string>;
    }> = [];

    // Direct iframes
    $("iframe").each((i, el) => {
      let src = $(el).attr("src") || $(el).attr("data-src") || "";
      if (src.startsWith("//")) {
        src = "https:" + src;
      }
      if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
        streams.push({
          server: `Player ${i + 1}`,
          link: src,
          type: src.includes(".m3u8") ? "m3u8" : "mp4",
          headers: { Referer: BASE_URL },
        });
      }
    });

    // Player options AJAX
    const options = $("#playeroptionsul li");
    for (let idx = 0; idx < options.length; idx++) {
      const el = options[idx];
      const post = $(el).attr("data-post");
      const nume = $(el).attr("data-nume");
      const type = $(el).attr("data-type");
      const title = $(el).find(".title").text().trim() || `Server ${idx + 1}`;

      if (post && nume && type) {
        try {
          const ajaxUrl = `${BASE_URL}/wp-json/dooplayer/v2/${post}/${type}/${nume}`;
          const ajaxRes = await axios.get(ajaxUrl, { headers, signal });
          let embedUrl = ajaxRes.data?.embed_url;
          if (embedUrl) {
            const $frame = cheerio.load(embedUrl);
            const frameSrc = $frame("iframe").attr("src") || embedUrl;
            streams.push({
              server: title,
              link: frameSrc.startsWith("//") ? "https:" + frameSrc : frameSrc,
              type: frameSrc.includes(".m3u8") ? "m3u8" : "mp4",
              headers: { Referer: BASE_URL },
            });
          }
        } catch (_) {}
      }
    }

    return streams;
  } catch (error) {
    console.error("Error in getStream:", error);
    return [];
  }
};
