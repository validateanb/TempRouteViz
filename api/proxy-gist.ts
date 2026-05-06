import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const gistUrl = req.query.url as string;
  if (!gistUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    let title = "";
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    if (gistUrl.includes('gist.github.com')) {
      try {
        const pageResponse = await fetch(gistUrl, { headers });
        if (pageResponse.ok) {
          const html = await pageResponse.text();
          const titleMatch = html.match(/<title>(.*?)<\/title>/);
          if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].split('·')[0].split(' - ')[0].trim();
          }
        }
      } catch (e) {
        console.error("Error fetching title:", e);
      }
    }

    let rawUrl = gistUrl;
    if (gistUrl.includes('gist.github.com') && !gistUrl.includes('gist.githubusercontent.com') && !gistUrl.includes('/raw')) {
      const cleanUrl = gistUrl.endsWith('/') ? gistUrl.slice(0, -1) : gistUrl;
      rawUrl = `${cleanUrl}/raw`;
    }

    const response = await fetch(rawUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch from GitHub: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ data: text, title });
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch remote content" });
  }
}
