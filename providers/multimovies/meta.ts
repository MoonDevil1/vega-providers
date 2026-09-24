import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://multimovies.tax";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: BASE_URL,
};

export const getMeta = async ({
  link,
}: {
  link: string;
  providerContext?: any;
}) => {
  try {
    const response = await axios.get(link, { headers });
    const $ = cheerio.load(response.data);

    const title =
      $("h1").first().text().trim() ||
      $(".data h1").text().trim() ||
      $(".entry-title").text().trim();

    const synopsis =
      $(".wp-content p, .entry-content p, .description p").first().text().trim();

    const image =
      $(".poster img").attr("data-src") ||
      $(".poster img").attr("src") ||
      "";

    const hasEpisodes = $("#seasons, .episodios, ul.episodios").length > 0;

    if (hasEpisodes) {
      const episodeList: Array<{
        title: string;
        link: string;
        episode: number;
        season: number;
      }> = [];

      $("#seasons .se-c, .se-c").each((sIdx, sEl) => {
        const seasonTitle = $(sEl).find(".se-t").text().trim();
        const seasonNum = parseInt(seasonTitle) || sIdx + 1;

        $(sEl)
          .find("ul.episodios li")
          .each((_, epEl) => {
            const epLink = $(epEl).find("a").attr("href") || "";
            const epTitle =
              $(epEl).find(".episodiotitle a").text().trim() ||
              $(epEl).find("a").text().trim();
            const numText = $(epEl).find(".numerando").text().trim();
            const parts = numText.split("-");
            const epNum = parseInt(parts[1]?.trim() || "") || 1;

            if (epLink) {
              episodeList.push({
                title: epTitle || `Episode ${epNum}`,
                link: epLink,
                episode: epNum,
                season: seasonNum,
              });
            }
          });
      });

      return {
        title,
        synopsis,
        image,
        type: "series",
        episodeList,
      };
    } else {
      return {
        title,
        synopsis,
        image,
        type: "movie",
      };
    }
  } catch (error) {
    console.error("Error in getMeta:", error);
    return {
      title: "",
      synopsis: "",
      image: "",
      type: "movie",
    };
  }
};
