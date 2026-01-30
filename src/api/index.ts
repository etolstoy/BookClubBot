import { Router } from "express";
import booksRouter from "./routes/books.js";
import reviewersRouter from "./routes/reviewers.js";
import reviewsRouter from "./routes/reviews.js";
import leaderboardRouter from "./routes/leaderboard.js";
import configRouter from "./routes/config.js";
import authorsRouter from "./routes/authors.js";
import volunteerRouter from "./routes/volunteer.js";
import { getStats } from "../services/review.service.js";

const router = Router();

router.use("/books", booksRouter);
router.use("/reviewers", reviewersRouter);
router.use("/reviews", reviewsRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/config", configRouter);
router.use("/authors", authorsRouter);
router.use("/volunteer", volunteerRouter);

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Stats endpoint
router.get("/stats", async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
