import { EpisodeLink, ProviderContext } from "../types";

export async function getEpisodeLinks({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  try {
    const response = await providerContext.axios.get(url, {
      headers: providerContext.commonHeaders,
      timeout: 20000,
      maxRedirects: 5,
    });
    const $ = providerContext.cheerio.load(response.data || "");
    const episodes: EpisodeLink[] = [];
    const seen = new Set<string>();

    $(".cinejoy-ep-card").each((_: number, element: any) => {
      const card = $(element);
      const id = String(card.attr("id") || "");
      const match = id.match(/ep-item-(\d+)-(\d+)/);
      const href = card.find("a.cinejoy-ep-thumb-link").attr("href") || card.find("a[href]").first().attr("href");
      if (!match || !href) return;
      const link = new URL(href, url).href;
      if (seen.has(link)) return;
      seen.add(link);
      const season = Number(match[1]);
      const episode = Number(match[2]);
      const title = card.find(".cinejoy-ep-name").text().trim() || `Episode ${episode}`;
      episodes.push({ title, link, description: `S${season}E${episode}` });
    });

    // Fallback for pages whose episode links are not wrapped in cinejoy cards.
    if (!episodes.length) {
      $("a[href]").each((_: number, element: any) => {
        const anchor = $(element);
        const title = anchor.text().replace(/\s+/g, " ").trim();
        const href = anchor.attr("href") || "";
        if (!href || !(/\bS\d+\s*E\d+\b/i.test(title) || /episode[-_/ ]?\d+/i.test(title))) return;
        const link = new URL(href, url).href;
        if (seen.has(link)) return;
        seen.add(link);
        episodes.push({ title, link });
      });
    }
    return episodes;
  } catch (error) {
    console.error("Multimovies episode parsing failed:", url, error);
    return [];
  }
}
