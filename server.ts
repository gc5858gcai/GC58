import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Serve public assets
  app.use(express.static(path.join(process.cwd(), "public")));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = await fs.readFile(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        console.error(`Vite Transform Error: ${e}`);
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    console.log("Starting in PRODUCTION mode");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      console.log(`SPA Fallback (Prod): ${req.url}`);
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Error:", err);
    res.status(500).send("Internal Server Error");
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is listening on 0.0.0.0:${PORT}`);
  });
}

startServer();
