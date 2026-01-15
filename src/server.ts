import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./lib/config.js";
import apiRouter from "./api/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging in development
  if (config.isDev) {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  // API routes
  app.use("/api", apiRouter);

  // Serve mini-app static files in production
  if (!config.isDev) {
    const miniAppPath = path.join(__dirname, "..", "miniapp-dist");

    // Serve static files with caching
    app.use(express.static(miniAppPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        // Don't cache index.html
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }));

    // Handle client-side routing - serve index.html for all non-API routes
    app.get("*", (req, res) => {
      res.sendFile(path.join(miniAppPath, "index.html"));
    });
  } else {
    // In development, show message for non-API routes
    app.use((req, res) => {
      res.status(404).json({
        error: "Not found",
        message: "Run mini-app dev server separately: cd mini-app && npm run dev"
      });
    });
  }

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export function startServer(app: express.Application) {
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, () => {
      console.log(`API server listening on port ${config.port}`);
      resolve();
    });

    server.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });
  });
}
