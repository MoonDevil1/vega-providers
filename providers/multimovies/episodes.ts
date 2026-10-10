import { EpisodeLink, ProviderContext } from "../types";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://multimovies.garden/",
};

function pageUrl(base: string, season?: number, range?: number): string {
  const url = new URL(base);
  if (season !== undefined) url.searchParams.set("season", String(season));
  if (range !== undefined) url.searchParams.set("ep_range", String(range));
  else url.searchParams.delete("ep_range");
  return url.href;
}

function parseEpisodes($: any, pageUrlValue: string): EpisodeLink[] {
  const out: EpisodeLink[] = [];
  $(".cinejoy-ep-card").each((_: number, el: any) => {
    const card = $(el);
    const match = String(card.attr("id") || "").match(/ep-item-(\d+)-(\d+)/);
    const href = card.find("a.cinejoy-ep-thumb-link").attr("href") ||
      card.find("a[href]").first().attr("href");
    // Episode IDs encode both season and episode. Ignore unrelated/repeated
    // cards that have no ID; they were the source of the unlabelled duplicates.
    if (!match || !href) return;
    const link = new URL(href, pageUrlValue).href;
    const season = match ? Number(match[1]) : undefined;
    const episode = match ? Number(match[2]) : undefined;
    const title = card.find(".cinejoy-ep-name").text().replace(/\s+/g, " ").trim() ||
      (episode ? `Episode ${episode}` : "");
    if (!title) return;
    out.push({
      title,
      link,
      ...(season && episode ? { description: `S${season}E${episode}` } : {}),
    });
  });
  return out;
}

async function fetchEpisodePage(url: string, providerContext: ProviderContext): Promise<{ html: string; $: any }> {
  const response = await providerContext.axios.get(url, {
    headers: { ...providerContext.commonHeaders, ...HEADERS },
    timeout: 20000,
    maxRedirects: 5,
  });
  const html = typeof response.data === "string" ? response.data : "";
  return { html, $: providerContext.cheerio.load(html) };
}

export async function getEpisodeLinks({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const base = new URL(url);
    base.hash = "";
    const seriesUrl = base.href;
    const first = await fetchEpisodePage(seriesUrl, providerContext);
    const all: EpisodeLink[] = parseEpisodes(first.$, seriesUrl);
    const seasons = first.$(".cinejoy-season-pill-dropdown select option")
      .map((_: number, el: any) => Number(first.$(el).attr("value")))
      .get()
      .filter((n: number) => Number.isInteger(n) && n > 0);
    const selectedSeason = Number(base.searchParams.get("season")) ||
      Number(first.$(".cinejoy-season-pill-dropdown select").val()) ||
      seasons[0] || 1;
    const ranges = (doc: any) => doc("select.episode-range-select option")
      .filter((_: number, el: any) => !doc(el).attr("selected"))
      .map((_: number, el: any) => Number(doc(el).attr("value")))
      .get()
      .filter((n: number) => Number.isInteger(n) && n > 0);

    // The site paginates long seasons using ep_range and puts only the selected
    // season/range in the initial HTML. Fetch every available season and range.
    const targets = seasons.filter((s: number) => s !== selectedSeason)
      .map((season: number) => ({ season }));
    for (const range of ranges(first.$)) targets.push({ season: selectedSeason, range } as any);

    const settled = await Promise.all(targets.map(async (target: any) => {
      const targetUrl = pageUrl(seriesUrl, target.season, target.range);
      try {
        const page = await fetchEpisodePage(targetUrl, providerContext);
        const found = parseEpisodes(page.$, targetUrl);
        const otherRanges = ranges(page.$).filter((r: number) => r !== target.range);
        const extra = await Promise.all(otherRanges.map(async (range: number) => {
          try {
            const rangeUrl = pageUrl(seriesUrl, target.season, range);
            const rangePage = await fetchEpisodePage(rangeUrl, providerContext);
            return parseEpisodes(rangePage.$, rangeUrl);
          } catch {
            return [];
          }
        }));
        return found.concat(...extra);
      } catch (error) {
        console.warn("Multimovies season fetch failed:", targetUrl, error);
        return [];
      }
    }));
    all.push(...settled.flat());

    // Stable dedupe by episode URL, then by season/episode marker where links
    // are repeated under multiple range tabs.
    const unique = new Map<string, EpisodeLink>();
    for (const episode of all) {
      const href = new URL(episode.link, seriesUrl).href;
      if (!unique.has(href)) unique.set(href, { ...episode, link: href });
    }

    // Compatibility fallback for a site markup change.
    if (!unique.size) {
      first.$("a[href]").each((_: number, el: any) => {
        const anchor = first.$(el);
        const title = anchor.text().replace(/\s+/g, " ").trim();
        const href = anchor.attr("href") || "";
        if (!href || !/\bS\d+\s*E\d+\b|episode[-_/ ]?\d+/i.test(title)) return;
        const link = new URL(href, seriesUrl).href;
        if (!unique.has(link)) unique.set(link, { title, link });
      });
    }

    return Array.from(unique.values()).sort((a, b) => {
      const ax = (a.description || "").match(/S(\d+)E(\d+)/i);
      const bx = (b.description || "").match(/S(\d+)E(\d+)/i);
      if (ax && bx) return Number(ax[1]) - Number(bx[1]) || Number(ax[2]) - Number(bx[2]);
      return 0;
    });
  } catch (error) {
    console.error("Multimovies episode parsing failed:", url, error);
    return [];
  }
}

export async function getEpisodes(args: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  return getEpisodeLinks(args);
}
