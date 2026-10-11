import { Info, ProviderContext } from "../types";

import { fetchHtml } from "./http";

function absolute(value: string | undefined, base: string): string {
  if (!value) return "";
  try { return new URL(value, base).href; } catch { return ""; }
}

export const getMeta = async function ({ link, providerContext, signal }: {
  link: string;
  signal?: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Info> {
  const html = await fetchHtml(link, providerContext, signal);
  const $ = providerContext.cheerio.load(html);
  let structured: any = {};
  $('script[type="application/ld+json"]').each((_: number, el: any) => {
    try {
      const parsed = JSON.parse($(el).text());
      const entries = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
      const media = entries.find((item: any) => /Movie|TVSeries|TVEpisode/.test(String(item?.["@type"])));
      if (media) structured = media;
    } catch { /* Ignore unrelated or malformed structured metadata. */ }
  });
  const title = $("h1").first().text().trim() || structured.name || $("title").text().trim();
  if (!title) throw new Error("Multimovies returned no title metadata");
  const synopsis = $("#cinejoyOverview").text().trim() ||
    $(".cinejoy-overview, .description, .synopsis").first().text().trim() || structured.description || "";
  const ldImage = Array.isArray(structured.image) ? structured.image[0] : structured.image;
  const imageRaw = $(".cinejoy-detail-poster img").attr("data-src") ||
    $(".cinejoy-detail-poster img").attr("src") ||
    (typeof ldImage === "string" ? ldImage : ldImage?.url) ||
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") || "";
  const image = absolute(imageRaw, link);
  const pillsText = $(".cinejoy-meta-pill").map((_: number, el: any) => $(el).text()).get().join(" ");
  const scoreMatch = pillsText.match(/★\s*([\d.]+)/);
  const imdbMatch = html.match(/tt\d{6,}/);
  const genres = $(".cinejoy-detail-genres").text().split("•").map((s: string) => s.trim()).filter(Boolean);
  const isSeries = /\/series\//i.test(new URL(link).pathname);
  const info: Info = {
    title, image, synopsis, imdbId: imdbMatch ? imdbMatch[0] : "",
    type: isSeries ? "series" : "movie",
    linkList: [{ title: "Play", directLinks: [{ title: "Play", link, type: "movie" }] }],
    tags: genres, rating: scoreMatch ? scoreMatch[1] : undefined,
  };

  if (isSeries) {
    // Each season is a separate Vega dropdown item, and getEpisodes only
    // returns episodes for the selected season.
    const select = $(".cinejoy-season-pill-dropdown select").first();
    const seasons = select.find("option").map((_: number, el: any) => {
      const raw = $(el).attr("value") || $(el).text();
      const match = String(raw).match(/\d+/);
      return match ? Number(match[0]) : 0;
    }).get().filter((n: number) => Number.isInteger(n) && n > 0);
    const unique = Array.from(new Set<number>(seasons)).sort((a, b) => a - b);
    const selected = Number(select.val()) || unique[0] || 1;
    info.linkList = (unique.length ? unique : [selected]).map((season) => {
      const seasonUrl = new URL(link);
      seasonUrl.searchParams.set("season", String(season));
      seasonUrl.searchParams.delete("ep_range");
      return { title: `Season ${season}`, episodesLink: seasonUrl.href };
    });
  }
  return info;
};
