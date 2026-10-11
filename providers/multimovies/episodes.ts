import { EpisodeLink, ProviderContext } from "../types";

import { fetchHtml } from "./http";

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

async function fetchPage(url: string, providerContext: ProviderContext, signal?: AbortSignal): Promise<{ $: any }> {
  const html = await fetchHtml(url, providerContext, signal);
  return { $: providerContext.cheerio.load(html) };
}

export async function getEpisodeLinks({ url, providerContext, signal }: {
  url: string; providerContext: ProviderContext; signal?: AbortSignal;
}): Promise<EpisodeLink[]> {
  try {
    const base = new URL(url);
    base.hash = "";
    const season = Number(base.searchParams.get("season")) || 1;
    const first = await fetchPage(base.href, providerContext, signal);
    const episodes = parseEpisodes(first.$, base.href, season);
    const ranges = Array.from(new Set<number>(first.$("select.episode-range-select option")
      .filter((_: number, el: any) => !first.$(el).is(":selected"))
      .map((_: number, el: any) => Number(first.$(el).attr("value")))
      .get().filter((n: number) => Number.isInteger(n) && n >= 0)));
    const extraPages = await Promise.all(ranges
      .map(async (range) => {
        const target = pageUrl(base.href, season, range);
        const page = await fetchPage(target, providerContext, signal);
        return parseEpisodes(page.$, target, season);
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
    throw error;
  }
}

export async function getEpisodes(args: { url: string; providerContext: ProviderContext; signal?: AbortSignal }): Promise<EpisodeLink[]> {
  return getEpisodeLinks(args);
}
