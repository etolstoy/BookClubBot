import express from "express";
import cors from "cors";
import { config } from "./lib/config.js";
import apiRouter from "./api/index.js";

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

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export function startServer(app: express.Application) {
  return new Promise<void>((resolve) => {
    app.listen(config.port, () => {
      console.log(`API server listening on port ${config.port}`);
      resolve();
    });
  });
}
