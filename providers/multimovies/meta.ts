const DOMAINS = [
  "https://multimovies.shop",
  "https://multimovies.click",
  "https://multimovies.ch",
  "https://multimovies.tax",
  "https://multimovies.top",
];

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

export const getMeta = async ({
  link,
}: {
  link: string;
  providerContext?: any;
}) => {
  try {
    let html = "";
    try {
      const res = await fetch(link, { headers });
      if (res.ok) html = await res.text();
    } catch (_) {}

    if (!html) {
      try {
        const urlObj = new URL(link);
        for (const d of DOMAINS) {
          try {
            const altUrl = `${d}${urlObj.pathname}${urlObj.search}`;
            const res = await fetch(altUrl, { headers });
            if (res.ok) {
              html = await res.text();
              break;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    if (!html) {
      return { title: "", synopsis: "", image: "", type: "movie" };
    }

    const titleMatch =
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    const descMatch =
      html.match(/<div class=["'][^"']*(?:wp-content|entry-content|description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<p class=["']desc["'][^>]*>([\s\S]*?)<\/p>/i);
    let synopsis = "";
    if (descMatch) {
      const pMatch = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      synopsis = (pMatch ? pMatch[1] : descMatch[1])
        .replace(/<[^>]+>/g, "")
        .trim();
    }

    const posterMatch =
      html.match(/<div class=["']poster["'][^>]*>[\s\S]*?<img[^>]*data-src=["']([^"']+)["']/i) ||
      html.match(/<div class=["']poster["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i) ||
      html.match(/property=["']og:image["']\s*content=["']([^"']+)["']/i);
    let image = posterMatch ? posterMatch[1] : "";
    if (image.startsWith("//")) image = "https:" + image;

    const isSeries =
      html.includes('id="seasons"') ||
      html.includes('class="episodios"') ||
      html.includes('class="se-c"');

    if (isSeries) {
      const episodeList: Array<{
        title: string;
        link: string;
        episode: number;
        season: number;
      }> = [];

      const seasonRegex = /<div class=["']se-c["'][^>]*>([\s\S]*?)<\/ul>\s*<\/div>/gi;
      let sMatch: RegExpExecArray | null;
      let sCount = 1;

      while ((sMatch = seasonRegex.exec(html)) !== null) {
        const sBlock = sMatch[1];
        const sNumMatch = sBlock.match(/<span class=["']se-t["'][^>]*>(\d+)<\/span>/i);
        const seasonNum = sNumMatch ? parseInt(sNumMatch[1]) : sCount++;

        const epRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let epMatch: RegExpExecArray | null;

        while ((epMatch = epRegex.exec(sBlock)) !== null) {
          const epBlock = epMatch[1];
          const epLinkMatch = epBlock.match(/href=["'](https?:\/\/[^"'\s]+)["']/i);
          const epTitleMatch =
            epBlock.match(/<div class=["']episodiotitle["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
            epBlock.match(/<a[^>]*>([^<]+)<\/a>/i);
          const numMatch = epBlock.match(/<div class=["']numerando["'][^>]*>([\s\S]*?)<\/div>/i);

          let epNum = 1;
          if (numMatch) {
            const parts = numMatch[1].replace(/<[^>]+>/g, "").trim().split("-");
            if (parts[1]) epNum = parseInt(parts[1].trim()) || 1;
          }

          if (epLinkMatch) {
            episodeList.push({
              title: epTitleMatch ? epTitleMatch[1].trim() : `Episode ${epNum}`,
              link: epLinkMatch[1],
              episode: epNum,
              season: seasonNum,
            });
          }
        }
      }

      return {
        title,
        synopsis,
        image,
        type: "series",
        episodeList,
      };
    }

    return {
      title,
      synopsis,
      image,
      type: "movie",
    };
  } catch (err) {
    return {
      title: "",
      synopsis: "",
      image: "",
      type: "movie",
    };
  }
};
