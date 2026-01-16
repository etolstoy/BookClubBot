import { Router, Request, Response } from "express";
import { getPopularAuthors } from "../../services/author.service.js";
import { getAllBooks } from "../../services/book.service.js";

const router = Router();

// Helper to parse and validate pagination parameters
function parsePaginationParams(req: Request): {
  limit: number;
  offset: number;
  error?: string;
} {
  const limit = parseInt(req.query.limit as string, 10) || 20;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  if (isNaN(limit) || limit < 1) {
    return { limit: 0, offset: 0, error: "Invalid limit parameter" };
  }
  if (isNaN(offset) || offset < 0) {
    return { limit: 0, offset: 0, error: "Invalid offset parameter" };
  }

  return { limit, offset };
}

// Wrapper for async route handlers with error handling
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((error) => {
      console.error("Error in authors route:", error);
      res.status(500).json({ error: "Failed to process request" });
    });
  };
}

// GET /api/authors - Popular authors leaderboard
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    // Parse minReviews parameter (default: 3)
    const minReviews = parseInt(req.query.minReviews as string, 10) || 3;
    if (isNaN(minReviews) || minReviews < 1) {
      res.status(400).json({ error: "Invalid minReviews parameter" });
      return;
    }

    const authors = await getPopularAuthors(limit, offset, minReviews);
    res.json({ authors });
  })
);

// GET /api/authors/:encodedName/books - Books by specific author
router.get(
  "/:encodedName/books",
  asyncHandler(async (req, res) => {
    const { limit, offset, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    // Decode author name from URL
    const authorName = decodeURIComponent(req.params.encodedName);

    if (!authorName || authorName.trim() === "") {
      res.status(400).json({ error: "Invalid author name" });
      return;
    }

    // Fetch books by this author using getAllBooks with search parameter
    // This will match against the author field
    const books = await getAllBooks({
      search: authorName,
      limit: limit || 50,
      offset,
    });

    // Filter to only include books where the author exactly matches
    // (getAllBooks does fuzzy search, we want exact match)
    const authorBooks = books.filter(
      (book: { author: string | null }) =>
        book.author && book.author.trim().toLowerCase() === authorName.trim().toLowerCase()
    );

    res.json({
      author: authorName,
      books: authorBooks,
    });
  })
);

export default router;
