import { EpisodeLink, ProviderContext } from "../types";
import { fetchHtml } from "./http";

function absoluteUrl(href: string, pageUrl: string): string {
  try { return new URL(href, pageUrl).toString(); } catch { return ""; }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const { cheerio } = providerContext;
  try {
    const html = await fetchHtml(url, providerContext);
    const $ = cheerio.load(html);
    const baseUrl = url.split("#")[0];
    const found = new Map<string, EpisodeLink>();

    // Current MultiMovies route format: /series/<slug>/season/<n>/episode/<n>.
    // Read anchors rather than the retired Cinejoy-only class names.
    $("a[href]").each((_, node) => {
      const a = $(node);
      const href = absoluteUrl(a.attr("href") || "", baseUrl);
      if (!href) return;
      const match = href.match(/\/series\/[^/?#]+\/season\/(\d+)\/episode\/(\d+)(?:[/?#]|$)/i);
      if (!match) return;

      const seasonNo = Number(match[1]);
      const episodeNo = Number(match[2]);
      const requestedSeason = baseUrl.match(/\/season\/(\d+)/i)?.[1]
        || baseUrl.match(/[?&](?:season|s)=(\d+)/i)?.[1];
      if (requestedSeason && seasonNo !== Number(requestedSeason)) return;

      const label = cleanText(
        a.attr("aria-label") || a.attr("title") || a.text() ||
        a.find("img").attr("alt") || ""
      );
      const title = label && !/^watch|^play$/i.test(label)
        ? label
        : `S${seasonNo} E${episodeNo}`;
      const canonical = href.split("#")[0];
      found.set(canonical, { title, link: canonical });
    });

    // Older Cinejoy layout fallback, retained for pages not migrated yet.
    if (!found.size) {
      const seasonMatch = url.match(/\/season\/(\d+)/i) || url.match(/[?&]season=(\d+)/i);
      const season = seasonMatch?.[1];
      let grid = season ? $(`#cinejoy-season-${season}`) : $(".cinejoy-season-grid.active");
      if (!grid.length) grid = $(".cinejoy-season-grid.active").first();
      if (!grid.length) grid = $(".cinejoy-season-grid").first();

      grid.find(".cinejoy-ep-card").each((_, card) => {
        const el = $(card);
        const a = el.find("a.cinejoy-ep-thumb-link").first();
        const href = absoluteUrl(
          a.attr("href") || el.find("a.cinejoy-ep-name").first().attr("href") || "",
          baseUrl
        );
        if (!href) return;
        const epNo = cleanText(el.find(".cinejoy-ep-badge-num").first().text());
        const name = cleanText(
          el.find(".cinejoy-ep-name").first().text() ||
          el.find(".cinejoy-ep-name").first().attr("title") || ""
        );
        found.set(href, { title: [epNo, name].filter(Boolean).join(" ") || name || epNo, link: href });
      });
    }

    return [...found.values()].sort((a, b) => {
      const aa = a.link.match(/\/season\/(\d+)\/episode\/(\d+)/i);
      const bb = b.link.match(/\/season\/(\d+)\/episode\/(\d+)/i);
      return aa && bb ? Number(aa[1]) - Number(bb[1]) || Number(aa[2]) - Number(bb[2]) : a.title.localeCompare(b.title);
    });
  } catch (err) {
    console.log("getEpisodes error:", err);
    return [];
  }
};
