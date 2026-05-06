import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Proxy route to fetch Gist content to bypass CORS
  app.get("/api/proxy-gist", async (req, res) => {
    const gistUrl = req.query.url as string;
    if (!gistUrl) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      let title = "";
      // Add User-Agent header as GitHub often requires it
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };

      // If it's a Gist URL, try to get the title from the main page
      if (gistUrl.includes('gist.github.com')) {
        try {
          const pageResponse = await fetch(gistUrl, { headers });
          if (pageResponse.ok) {
            const html = await pageResponse.text();
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            if (titleMatch && titleMatch[1]) {
              // Clean up title: usually contains "Name · GitHub" or similar
              title = titleMatch[1].split('·')[0].split(' - ')[0].trim();
            }
          }
        } catch (e) {
          console.error("Error fetching title:", e);
        }
      }

      let rawUrl = gistUrl;
      // Convert standard Gist URL to raw URL if needed
      if (gistUrl.includes('gist.github.com') && !gistUrl.includes('gist.githubusercontent.com') && !gistUrl.includes('/raw')) {
        // Remove trailing slash if present
        const cleanUrl = gistUrl.endsWith('/') ? gistUrl.slice(0, -1) : gistUrl;
        rawUrl = `${cleanUrl}/raw`;
      }

      const response = await fetch(rawUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch from GitHub: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ data: text, title });
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch remote content" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
