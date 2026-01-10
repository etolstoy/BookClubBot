import { Router } from "express";
import {
  getMonthlyLeaderboard,
  getYearlyLeaderboard,
  getOverallLeaderboard,
  getLast30DaysLeaderboard,
  getLast365DaysLeaderboard,
  getMostReviewedBooks,
  getLast30DaysMostReviewedBooks,
  getLast365DaysMostReviewedBooks,
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

// GET /api/leaderboard/books - Most reviewed books (overall)
router.get("/books", async (req, res) => {
  try {
    const { limit = "10", offset = "0" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const leaderboard = await getMostReviewedBooks(parsedLimit, parsedOffset);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/books/monthly - Monthly most reviewed books
router.get("/books/monthly", async (req, res) => {
  try {
    const { year, month, limit = "10", offset = "0" } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const targetMonth = month ? parseInt(month as string, 10) : now.getMonth() + 1;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const leaderboard = await getMostReviewedBooks(
      parsedLimit,
      parsedOffset,
      { type: 'monthly', year: targetYear, month: targetMonth }
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
    console.error("Error fetching monthly book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/books/yearly - Yearly most reviewed books
router.get("/books/yearly", async (req, res) => {
  try {
    const { year, limit = "10", offset = "0" } = req.query;

    const now = new Date();
    const targetYear = year ? parseInt(year as string, 10) : now.getFullYear();
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const leaderboard = await getMostReviewedBooks(
      parsedLimit,
      parsedOffset,
      { type: 'yearly', year: targetYear }
    );

    res.json({
      period: {
        type: "yearly",
        year: targetYear,
      },
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching yearly book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/books/last30days - Most reviewed books in last 30 days
router.get("/books/last30days", async (req, res) => {
  try {
    const { limit = "10", offset = "0" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const leaderboard = await getLast30DaysMostReviewedBooks(parsedLimit, parsedOffset);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching last 30 days book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/books/last365days - Most reviewed books in last 365 days
router.get("/books/last365days", async (req, res) => {
  try {
    const { limit = "10", offset = "0" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const leaderboard = await getLast365DaysMostReviewedBooks(parsedLimit, parsedOffset);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching last 365 days book leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/reviewers/monthly - Monthly top reviewers
router.get("/reviewers/monthly", async (req, res) => {
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
    console.error("Error fetching monthly reviewers leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/reviewers/yearly - Yearly top reviewers
router.get("/reviewers/yearly", async (req, res) => {
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
    console.error("Error fetching yearly reviewers leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/reviewers - Overall top reviewers
router.get("/reviewers", async (req, res) => {
  try {
    const { limit = "10" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getOverallLeaderboard(parsedLimit);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching overall reviewers leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/reviewers/last30days - Last 30 days top reviewers
router.get("/reviewers/last30days", async (req, res) => {
  try {
    const { limit = "10" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getLast30DaysLeaderboard(parsedLimit);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching last 30 days reviewers leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /api/leaderboard/reviewers/last365days - Last 365 days top reviewers
router.get("/reviewers/last365days", async (req, res) => {
  try {
    const { limit = "10" } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const leaderboard = await getLast365DaysLeaderboard(parsedLimit);

    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching last 365 days reviewers leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
