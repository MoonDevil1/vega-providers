import { Info, ProviderContext } from "../types";

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const { axios, cheerio, commonHeaders } = providerContext;

  try {
    const res = await axios.get(link, {
      headers: {
        ...commonHeaders,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(res.data);
    const title =
      $("h1").first().text().trim() ||
      $(".data h1").text().trim() ||
      $(".entry-title").text().trim() ||
      "";

    const synopsis =
      $(".wp-content p, .entry-content p, .description p").first().text().trim() || "";

    let image =
      $(".poster img").attr("data-src") ||
      $(".poster img").attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      "";

    if (image && image.startsWith("//")) image = "https:" + image;

    const linkList: any[] = [];
    const seasons = $("#seasons .se-c");

    if (seasons.length > 0) {
      seasons.each((sIdx, sEl) => {
        const sNum = $(sEl).find(".se-t").text().trim() || `${sIdx + 1}`;
        const directLinks: any[] = [];

        $(sEl).find("ul.episodios li").each((_, epEl) => {
          const epLink = $(epEl).find("a").attr("href") || "";
          const epTitle =
            $(epEl).find(".episodiotitle a").text().trim() ||
            $(epEl).find("a").text().trim();
          if (epLink) {
            directLinks.push({
              title: epTitle || `Episode ${directLinks.length + 1}`,
              link: epLink,
              type: "series",
            });
          }
        });

        if (directLinks.length > 0) {
          linkList.push({
            title: sNum.toLowerCase().includes("season") ? sNum : `Season ${sNum}`,
            directLinks,
          });
        }
      });
    }

    if (linkList.length === 0) {
      linkList.push({
        title: "Full Movie",
        directLinks: [
          {
            title: title || "Play Movie",
            link: link,
            type: "movie",
          },
        ],
      });
    }

    return {
      title,
      synopsis,
      image,
      type: seasons.length > 0 ? "series" : "movie",
      linkList,
    };
  } catch (err) {
    return {
      title: "",
      synopsis: "",
      image: "",
      type: "movie",
      linkList: [
        {
          title: "Default",
          directLinks: [{ title: "Stream", link, type: "movie" }],
        },
      ],
    };
  }
};
