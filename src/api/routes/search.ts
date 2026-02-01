import { Router } from "express";
import { search } from "../../services/search.service.js";

const router = Router();

// GET /api/search - Unified search across books, authors, users, and reviews
router.get("/", async (req, res) => {
  try {
    const { q, type = "all", limit = "20", offset = "0" } = req.query;

    // Validate query
    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    if (q.length < 2) {
      res.status(400).json({ error: "Query must be at least 2 characters" });
      return;
    }

    // Validate type
    const validTypes = ["all", "books", "authors", "users", "reviews"];
    if (!validTypes.includes(type as string)) {
      res.status(400).json({
        error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    // Validate pagination params
    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      res.status(400).json({ error: "Invalid limit parameter (1-100)" });
      return;
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid offset parameter" });
      return;
    }

    const result = await search(
      q,
      type as "all" | "books" | "authors" | "users" | "reviews",
      parsedLimit,
      parsedOffset
    );

    res.json(result);
  } catch (error) {
    console.error("Error in unified search:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
