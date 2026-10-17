import { Info, Link, ProviderContext } from "../types";
import { fetchHtml } from "./http";

function abs(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return ""; }
}
function text(value: string): string { return value.replace(/\s+/g, " ").trim(); }

export const getMeta = async function ({
  link,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const { cheerio } = providerContext;
  const empty: Info = { title: "", synopsis: "", image: "", imdbId: "", type: "movie", linkList: [] };
  try {
    const html = await fetchHtml(link, providerContext);
    const $ = cheerio.load(html);
    const canonical = link.split("#")[0].split("?")[0].replace(/\/$/, "");
    const seriesRoute = /\/series\/[^/]+/i.test(canonical);
    const episodeRoute = /\/season\/\d+\/episode\/\d+/i.test(canonical);
    const episodes: { href: string; season: number; episode: number }[] = [];

    $("a[href]").each((_, node) => {
      const href = abs($(node).attr("href") || "", canonical);
      const m = href.match(/\/series\/[^/?#]+\/season\/(\d+)\/episode\/(\d+)(?:[/?#]|$)/i);
      if (m) episodes.push({ href: href.split("#")[0], season: Number(m[1]), episode: Number(m[2]) });
    });

    let watchItem: any = null;
    $("script").each((_, node) => {
      const raw = $(node).html() || "";
      const m = raw.match(/(?:const|let|var)\s+watchItem\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (m && !watchItem) { try { watchItem = JSON.parse(m[1]); } catch {} }
    });

    const title = text(watchItem?.title?.toString() ||
      $(".cinejoy-detail-title").first().text() ||
      $(".watch-details-summary").first().text() ||
      $("h1").first().text() ||
      $("meta[property='og:title']").attr("content") || "")
      .replace(/\s*[-|]\s*MultiMovies.*$/i, "") || "Unknown Title";
    const image = watchItem?.poster ||
      $(".cinejoy-detail-poster img").first().attr("src") ||
      $(".watch-bg img").first().attr("src") ||
      $("meta[property='og:image']").attr("content") || "";
    const synopsis = text($("#cinejoyOverview").first().text() ||
      $(".cinejoy-detail-overview").first().text() ||
      $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") || "");
    const isSeries = seriesRoute || episodeRoute || !!$(".cinejoy-episodes-section").length ||
      episodes.length > 0 || /series|tv/i.test(watchItem?.type || "");

    const result: Info = { title, synopsis, image, imdbId: "", type: isSeries ? "series" : "movie", linkList: [], webUrl: link };

    if (isSeries) {
      const seriesBase = canonical.replace(/\/season\/\d+\/episode\/\d+$/i, "");
      const seasons = new Map<number, string>();
      episodes.forEach(ep => seasons.set(ep.season, `Season ${ep.season}`));
      $(".cinejoy-season-select option").each((_, opt) => {
        const value = text($(opt).attr("value") || "");
        const match = value.match(/\d+/);
        if (match) seasons.set(Number(match[0]), text($(opt).text()) || `Season ${match[0]}`);
      });
      $("a[href]").each((_, node) => {
        const href = abs($(node).attr("href") || "", seriesBase);
        const match = href.match(/\/series\/[^/?#]+(?:\?season=(\d+)|\/season\/(\d+))(?:[&#/]|$)/i);
        if (match) {
          const n = Number(match[1] || match[2]);
          if (n >= 0) seasons.set(n, `Season ${n}`);
        }
      });
      const currentSeason = canonical.match(/\/season\/(\d+)\/episode\/(\d+)/i)?.[1];
      if (currentSeason) seasons.set(Number(currentSeason), `Season ${currentSeason}`);
      if (!seasons.size) seasons.set(1, "Season 1");
      result.linkList = [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([n, label]): Link => ({
        title: label, quality: "", episodesLink: `${seriesBase}?season=${n}`,
      }));
    } else {
      result.linkList = [{ title, quality: "", episodesLink: canonical, directLinks: [{ title, link: canonical, type: "movie" }] }];
    }
    return result;
  } catch (err) {
    console.log("getMeta error:", err);
    return empty;
  }
};
