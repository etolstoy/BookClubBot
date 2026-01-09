import { Router } from "express";
import booksRouter from "./routes/books.js";
import reviewersRouter from "./routes/reviewers.js";
import leaderboardRouter from "./routes/leaderboard.js";

const router = Router();

router.use("/books", booksRouter);
router.use("/reviewers", reviewersRouter);
router.use("/leaderboard", leaderboardRouter);

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
