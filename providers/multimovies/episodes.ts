import { EpisodeLink, ProviderContext } from "../types";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://multimovies.garden/",
};

function pageUrl(base: string, season: number, range?: number): string {
  const url = new URL(base);
  url.searchParams.set("season", String(season));
  if (range !== undefined) url.searchParams.set("ep_range", String(range));
  else url.searchParams.delete("ep_range");
  return url.href;
}

function parseEpisodes($: any, url: string, seasonWanted: number): EpisodeLink[] {
  const out: EpisodeLink[] = [];
  $(".cinejoy-ep-card").each((_: number, el: any) => {
    const card = $(el);
    const match = String(card.attr("id") || "").match(/ep-item-(\d+)-(\d+)/);
    const href = card.find("a.cinejoy-ep-thumb-link").attr("href") || card.find("a[href]").first().attr("href");
    if (!match || !href || Number(match[1]) !== seasonWanted) return;
    const season = Number(match[1]), episode = Number(match[2]);
    const title = card.find(".cinejoy-ep-name").text().replace(/\s+/g, " ").trim() || `Episode ${episode}`;
    out.push({ title, link: new URL(href, url).href, description: `S${season}E${episode}` });
  });
  return out;
}

async function fetchPage(url: string, providerContext: ProviderContext): Promise<{ $: any }> {
  const response = await providerContext.axios.get(url, {
    headers: { ...providerContext.commonHeaders, ...HEADERS },
    timeout: 20000, maxRedirects: 5,
  });
  const html = typeof response.data === "string" ? response.data : "";
  return { $: providerContext.cheerio.load(html) };
}

export async function getEpisodeLinks({ url, providerContext }: {
  url: string; providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const base = new URL(url);
    base.hash = "";
    const season = Number(base.searchParams.get("season")) || 1;
    const first = await fetchPage(base.href, providerContext);
    const episodes = parseEpisodes(first.$, base.href, season);
    const ranges = Array.from(new Set<number>(first.$("select.episode-range-select option")
      .map((_: number, el: any) => Number(first.$(el).attr("value")))
      .get().filter((n: number) => Number.isInteger(n) && n > 0)));
    const extraPages = await Promise.all(ranges
      .filter((range) => range !== Number(base.searchParams.get("ep_range")))
      .map(async (range) => {
        const target = pageUrl(base.href, season, range);
        try {
          const page = await fetchPage(target, providerContext);
          return parseEpisodes(page.$, target, season);
        } catch (error) {
          console.warn("Multimovies episode range failed:", target, error);
          return [];
        }
      }));
    const unique = new Map<string, EpisodeLink>();
    for (const episode of [...episodes, ...extraPages.flat()]) {
      if (!unique.has(episode.link)) unique.set(episode.link, episode);
    }
    if (!unique.size) {
      first.$("a[href]").each((_: number, el: any) => {
        const anchor = first.$(el);
        const label = anchor.text().replace(/\s+/g, " ").trim();
        const href = anchor.attr("href") || "";
        const marker = label.match(/S\s*(\d+)\s*E\s*\d+/i);
        if (!href || (marker && Number(marker[1]) !== season) ||
            !/\bS\s*\d+\s*E\s*\d+\b|episode[-_/ ]?\d+/i.test(label)) return;
        const full = new URL(href, base.href).href;
        if (!unique.has(full)) unique.set(full, { title: label, link: full });
      });
    }
    return Array.from(unique.values()).sort((a, b) => {
      const ax = (a.description || "").match(/S\d+E(\d+)/i);
      const bx = (b.description || "").match(/S\d+E(\d+)/i);
      return ax && bx ? Number(ax[1]) - Number(bx[1]) : 0;
    });
  } catch (error) {
    console.error("Multimovies episode parsing failed:", url, error);
    return [];
  }
}

export async function getEpisodes(args: { url: string; providerContext: ProviderContext }): Promise<EpisodeLink[]> {
  return getEpisodeLinks(args);
}
