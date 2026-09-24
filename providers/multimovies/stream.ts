const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
};

export const getStream = async ({
  link,
  signal,
}: {
  link: string;
  type?: string;
  signal?: AbortSignal;
  providerContext?: any;
  isDownload?: boolean;
}) => {
  try {
    const res = await fetch(link, { headers, signal });
    if (!res.ok) return [];
    const html = await res.text();
    const streams: Array<{
      server: string;
      link: string;
      type: string;
      headers?: Record<string, string>;
    }> = [];

    // Extract direct iframes
    const iframeRegex = /<iframe[^>]*src=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    let count = 1;

    while ((match = iframeRegex.exec(html)) !== null) {
      let src = match[1];
      if (src.startsWith("//")) src = "https:" + src;
      if (src.startsWith("http")) {
        streams.push({
          server: `Player ${count++}`,
          link: src,
          type: src.includes(".m3u8") ? "m3u8" : "mp4",
          headers: { Referer: link },
        });
      }
    }

    // Extract Dooplay AJAX player options
    const optRegex = /<li[^>]*data-post=["'](\d+)["'][^>]*data-nume=["'](\d+)["'][^>]*data-type=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
    while ((match = optRegex.exec(html)) !== null) {
      const postId = match[1];
      const nume = match[2];
      const pType = match[3];
      const titleMatch = match[4].match(/<span class=["']title["'][^>]*>([^<]+)<\/span>/i);
      const serverTitle = titleMatch ? titleMatch[1].trim() : `Server ${nume}`;

      try {
        const origin = new URL(link).origin;
        const ajaxUrl = `${origin}/wp-json/dooplayer/v2/${postId}/${pType}/${nume}`;
        const ajaxRes = await fetch(ajaxUrl, { headers, signal });
        if (ajaxRes.ok) {
          const json = await ajaxRes.json();
          let embed = json.embed_url;
          if (embed) {
            const frameMatch = embed.match(/src=["']([^"']+)["']/i);
            let embedSrc = frameMatch ? frameMatch[1] : embed;
            if (embedSrc.startsWith("//")) embedSrc = "https:" + embedSrc;
            if (embedSrc.startsWith("http")) {
              streams.push({
                server: serverTitle,
                link: embedSrc,
                type: embedSrc.includes(".m3u8") ? "m3u8" : "mp4",
                headers: { Referer: origin },
              });
            }
          }
        }
      } catch (_) {}
    }

    return streams;
  } catch (err) {
    return [];
  }
};
