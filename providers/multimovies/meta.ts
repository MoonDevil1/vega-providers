// providers/multimovies/meta.ts
import { Info, EpisodeLink, ProviderContext } from "../types";

export const getMeta = async function ({
    link,
        providerContext,
        }: {
            link: string;
                providerContext: ProviderContext;
                }): Promise<Info> {
                    const { axios, cheerio } = providerContext;
                        const { data: html } = await axios.get(link);
                            const $ = cheerio.load(html);

                                // --- Basic Metadata (matches your Kotlin parseMeta) ---
                                    const title = $("h1").first().text().trim() || "";
                                        const synopsis = $("#cinejoyOverview").text().trim() || "";
                                            const imageRaw =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $(".cinejoy-detail-poster img").attr("data-src") ||
      $(".cinejoy-detail-poster img").attr("src") ||
      $("img").first().attr("src") ||
      "";
    let image = "";
    try {
      image = imageRaw ? new URL(imageRaw, link).href : "";
    } catch {
      image = "";
    }

                                                // --- Parse Pills (matches your Kotlin parsePills) ---
                                                    const pillsText = $(".cinejoy-meta-pill")
                                                            .map((_, el) => $(el).text())
                                                                    .get()
                                                                            .join(" ");
                                                                                const yearMatch = pillsText.match(/\b((?:19|20)\d{2})\b/);
                                                                                    const year = yearMatch ? yearMatch[1] : undefined;
                                                                                        const scoreMatch = pillsText.match(/★\s*([\d.]+)/);
                                                                                            const rating = scoreMatch ? scoreMatch[1] : undefined;
    const imdbMatch = html.match(/tt\\d{6,}/);

                                                                                                const genres = $(".cinejoy-detail-genres")
                                                                                                        .text()
                                                                                                                .split("•")
                                                                                                                        .map((s) => s.trim())
                                                                                                                                .filter(Boolean);

                                                                                                                                    const info: Info = {
                                                                                                                                            title,
                                                                                                                                                    image,
                                                                                                                                                            synopsis,
                                                                                                                                                                    imdbId: imdbMatch ? imdbMatch[0] : "",
                                                                                                            type: link.includes("/series/") ? "series" : "movie",
                                                                                                                                                                            linkList: [{ title: "Play", directLinks: [{ title: "Play", link }] }],
                                                                                                                                                                                    tags: genres,
                                                                                                                                                                                            rating,
                                                                                                                                                                                                        };

                                                                                                                                                                                                            // --- TV Series Episodes (matches your Kotlin parseEpisodes) ---
                                                                                                                                                                                                                if (link.includes("/series/")) {
                                                                                                                                                                                                                        const episodes: EpisodeLink[] = [];
                                                                                                                                                                                                                                $(".cinejoy-ep-card").each((_, el) => {
                                                                                                                                                                                                                                            const $el = $(el);
                                                                                                                                                                                                                                                        const idAttr = $el.attr("id") || "";
                                                                                                                                                                                                                                                                    const m = idAttr.match(/ep-item-(\d+)-(\d+)/);
                                                                                                                                                                                                                                                                                if (!m) return;
                                                                                                                                                                                                                                                                                            const season = parseInt(m[1]);
                                                                                                                                                                                                                                                                                                        const episode = parseInt(m[2]);
                                                                                                                                                                                                                                                                                                                    const href = $el.find("a.cinejoy-ep-thumb-link").attr("href");
                                                                                                                                                                                                                                                                                                                                if (!href) return;
                                                                                                                                                                                                                                                                                                                                            const epName = $el.find(".cinejoy-ep-name").text().trim() || `Episode ${episode}`;
                                                                                                                                                                                                                                                                                                                                                        episodes.push({
                                                                                                                                                                                                                                                                                                                                                                                        title: epName,
                                                                                                                                                                                                                                                                                                                                                                                                        link: new URL(href, link).href,
                                                                                                                                                                                                                                                                                                                                                                                                                        description: `S${season}E${episode}`,
                                                                                                                                                                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                                                                                                                                                                            });
                                                                                                                                                                                                                                                                                                                                                                                                                                                    info.linkList = [{
                                                                                                                                                                                                                                                                                                                                                                                                                                                                title: "Episodes",
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            episodesLink: link,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        directLinks: episodes.map((e) => ({ title: e.title, link: e.link, type: "series" })),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                }];
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        return info;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        };