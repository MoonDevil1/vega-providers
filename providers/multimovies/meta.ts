import { Info, ProviderContext } from "../types";

const BASE_URL = "https://multimovies.garden";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Referer: BASE_URL + "/",
  "Accept-Language": "en-US,en;q=0.9",
};

function absolute(value: string | undefined, base: string): string {
  if (!value) return "";
  try { return new URL(value, base).href; } catch { return ""; }
}

export const getMeta = async function ({ link, providerContext }: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Info> {
  const response = await providerContext.axios.get(link, {
    headers: { ...providerContext.commonHeaders, ...HEADERS },
    timeout: 20000,
    maxRedirects: 5,
  });
  const html = typeof response.data === "string" ? response.data : "";
  const $ = providerContext.cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim();
  const synopsis = $("#cinejoyOverview").text().trim() ||
    $(".cinejoy-overview, .description, .synopsis").first().text().trim();
  const imageRaw = $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $(".cinejoy-detail-poster img").attr("data-src") ||
    $(".cinejoy-detail-poster img").attr("src") || $("img").first().attr("src") || "";
  const image = absolute(imageRaw, link);
  const pillsText = $(".cinejoy-meta-pill").map((_: number, el: any) => $(el).text()).get().join(" ");
  const scoreMatch = pillsText.match(/★\s*([\d.]+)/);
  const imdbMatch = html.match(/tt\d{6,}/);
  const genres = $(".cinejoy-detail-genres").text().split("•").map((s: string) => s.trim()).filter(Boolean);
  const isSeries = /\/series\//i.test(new URL(link).pathname);
  const info: Info = {
    title, image, synopsis, imdbId: imdbMatch ? imdbMatch[0] : "",
    type: isSeries ? "series" : "movie",
    linkList: [{ title: "Play", directLinks: [{ title: "Play", link }] }],
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
      return { title: `Season ${season}`, episodesLink: seasonUrl.href, directLinks: [] };
    });
  }
  return info;
};
