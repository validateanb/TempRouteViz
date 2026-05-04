import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const gistUrl = req.query.url as string;
  if (!gistUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    let title = "";
    // If it's a Gist URL, try to get the title from the main page
    if (gistUrl.includes('gist.github.com')) {
      const pageResponse = await fetch(gistUrl);
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].split('·')[0].trim();
        }
      }
    }

    let rawUrl = gistUrl;
    // Convert standard Gist URL to raw URL if needed
    if (gistUrl.includes('gist.github.com') && !gistUrl.includes('/raw')) {
      rawUrl = gistUrl.endsWith('/') ? gistUrl + 'raw' : gistUrl + '/raw';
    }

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch from GitHub: ${response.statusText}`);
    }
    
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ data: text, title });
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Failed to fetch remote content" });
  }
}
