import { Router } from "express";
import {
  getMonthlyLeaderboard,
  getYearlyLeaderboard,
  getMostReviewedBooks,
} from "../../services/review.service.js";

const router = Router();

// GET /api/leaderboard/monthly - Monthly top reviewers
router.get("/monthly", async (req, res) => {
  try {
    const { year, month, limit = "10" } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getMonth() + 1;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getMonthlyLeaderboard(
      targetYear,
      targetMonth,
      parsedLimit
    );

    res.json({
      period: {
        type: "monthly",
        year: targetYear,
        month: targetMonth,
      },
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching monthly leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/yearly - Yearly top reviewers
router.get("/yearly", async (req, res) => {
  try {
    const { year, limit = "10" } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getYearlyLeaderboard(
      targetYear,
      parsedLimit
    );

    res.json({
      period: {
        type: "yearly",
        year: targetYear,
      },
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching yearly leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/books - Most reviewed books
router.get("/books", async (req, res) => {
  try {
    const { limit = "10" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getMostReviewedBooks(
      parsedLimit
    );

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
