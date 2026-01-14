import { Router, Request, Response } from "express";
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

// Helper to parse and validate pagination parameters
function parsePaginationParams(req: Request): {
  limit: number;
  offset: number;
  error?: string;
} {
  const limit = parseInt(req.query.limit as string, 10) || 10;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  if (isNaN(limit) || limit < 1) {
    return { limit: 0, offset: 0, error: "Invalid limit parameter" };
  }
  if (isNaN(offset) || offset < 0) {
    return { limit: 0, offset: 0, error: "Invalid offset parameter" };
  }

  return { limit, offset };
}

// Helper to parse year/month parameters
function parsePeriodParams(req: Request): { year: number; month: number } {
  const now = new Date();
  const year = req.query.year
    ? parseInt(req.query.year as string, 10)
    : now.getFullYear();
  const month = req.query.month
    ? parseInt(req.query.month as string, 10)
    : now.getMonth() + 1;
  return { year, month };
}

// Wrapper for async route handlers with error handling
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((error) => {
      console.error("Error in leaderboard route:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    });
  };
}

// GET /api/leaderboard/monthly - Monthly top reviewers (legacy)
router.get(
  "/monthly",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year, month } = parsePeriodParams(req);
    const leaderboard = await getMonthlyLeaderboard(year, month, limit);

    res.json({
      period: { type: "monthly", year, month },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/yearly - Yearly top reviewers (legacy)
router.get(
  "/yearly",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year } = parsePeriodParams(req);
    const leaderboard = await getYearlyLeaderboard(year, limit);

    res.json({
      period: { type: "yearly", year },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/books - Most reviewed books (overall)
router.get(
  "/books",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getMostReviewedBooks(limit, offset);
    res.json({ leaderboard });
  })
);

// GET /api/leaderboard/books/monthly - Monthly most reviewed books
router.get(
  "/books/monthly",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year, month } = parsePeriodParams(req);
    const leaderboard = await getMostReviewedBooks(limit, offset, {
      type: "monthly",
      year,
      month,
    });

    res.json({
      period: { type: "monthly", year, month },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/books/yearly - Yearly most reviewed books
router.get(
  "/books/yearly",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year } = parsePeriodParams(req);
    const leaderboard = await getMostReviewedBooks(limit, offset, {
      type: "yearly",
      year,
    });

    res.json({
      period: { type: "yearly", year },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/books/last30days - Most reviewed books in last 30 days
router.get(
  "/books/last30days",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getLast30DaysMostReviewedBooks(limit, offset);
    res.json({ leaderboard });
  })
);

// GET /api/leaderboard/books/last365days - Most reviewed books in last 365 days
router.get(
  "/books/last365days",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getLast365DaysMostReviewedBooks(limit, offset);
    res.json({ leaderboard });
  })
);

// GET /api/leaderboard/reviewers/monthly - Monthly top reviewers
router.get(
  "/reviewers/monthly",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year, month } = parsePeriodParams(req);
    const leaderboard = await getMonthlyLeaderboard(year, month, limit);

    res.json({
      period: { type: "monthly", year, month },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/reviewers/yearly - Yearly top reviewers
router.get(
  "/reviewers/yearly",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { year } = parsePeriodParams(req);
    const leaderboard = await getYearlyLeaderboard(year, limit);

    res.json({
      period: { type: "yearly", year },
      leaderboard,
    });
  })
);

// GET /api/leaderboard/reviewers - Overall top reviewers
router.get(
  "/reviewers",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getOverallLeaderboard(limit);
    res.json({ leaderboard });
  })
);

// GET /api/leaderboard/reviewers/last30days - Last 30 days top reviewers
router.get(
  "/reviewers/last30days",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getLast30DaysLeaderboard(limit);
    res.json({ leaderboard });
  })
);

// GET /api/leaderboard/reviewers/last365days - Last 365 days top reviewers
router.get(
  "/reviewers/last365days",
  asyncHandler(async (req, res) => {
    const { limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const leaderboard = await getLast365DaysLeaderboard(limit);
    res.json({ leaderboard });
  })
);

export default router;
