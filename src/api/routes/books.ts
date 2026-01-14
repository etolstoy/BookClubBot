import { Router } from "express";
import {
  getAllBooks,
  getBookById,
  searchBooks,
  getGoogleBooksUrl,
} from "../../services/book.service.js";
import { getReviewsByBookId } from "../../services/review.service.js";
import {
  searchBooks as searchGoogleBooks,
  searchBookByISBN,
  type BookSearchResult,
} from "../../services/googlebooks.js";

const router = Router();

function generateGoodreadsUrl(
  isbn: string | null,
  title: string,
  author: string | null
): string | null {
  // Prefer ISBN-based URL (most reliable)
  if (isbn) {
    const cleanIsbn = isbn.replace(/-/g, "");
    return `https://www.goodreads.com/book/isbn/${cleanIsbn}`;
  }

  // Fallback to search URL
  const query = author ? `${title} ${author}` : title;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.goodreads.com/search?q=${encodedQuery}`;
}

function detectISBN(query: string): string | null {
  // Remove hyphens and spaces
  const cleaned = query.replace(/[-\s]/g, "");

  // Check for ISBN-10 (10 digits) or ISBN-13 (13 digits)
  const isbn10Pattern = /^\d{10}$/;
  const isbn13Pattern = /^\d{13}$/;

  if (isbn10Pattern.test(cleaned) || isbn13Pattern.test(cleaned)) {
    return cleaned;
  }

  return null;
}

// GET /api/books - List all books
router.get("/", async (req, res) => {
  try {
    const {
      sortBy,
      genre,
      search,
      limit = "50",
      offset = "0",
    } = req.query;

    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid limit or offset parameter" });
      return;
    }

    const books = await getAllBooks({
      sortBy: sortBy as "reviewCount" | "recentlyReviewed" | "alphabetical" | undefined,
      genre: genre as string | undefined,
      search: search as string | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json({ books });
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).json({ error: "Failed to fetch books" });
  }
});

// GET /api/books/search - Search books
router.get("/search", async (req, res) => {
  try {
    const { q, limit = "20" } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    const parsedLimit = parseInt(limit as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      res.status(400).json({ error: "Invalid limit parameter" });
      return;
    }

    const books = await searchBooks(q, parsedLimit);

    res.json({
      books: books.map((book: {
        id: number;
        title: string;
        author: string | null;
        coverUrl: string | null;
        genres: string | null;
        publicationYear: number | null;
        reviews: Array<{ sentiment: string | null }>;
        _count: { reviews: number };
      }) => {
        const sentiments = book.reviews.reduce(
          (acc: { positive: number; negative: number; neutral: number }, r: { sentiment: string | null }) => {
            if (r.sentiment === "positive") acc.positive++;
            else if (r.sentiment === "negative") acc.negative++;
            else if (r.sentiment === "neutral") acc.neutral++;
            return acc;
          },
          { positive: 0, negative: 0, neutral: 0 }
        );

        return {
          id: book.id,
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl,
          genres: book.genres ? JSON.parse(book.genres) : [],
          publicationYear: book.publicationYear,
          reviewCount: book._count.reviews,
          sentiments,
        };
      }),
    });
  } catch (error) {
    console.error("Error searching books:", error);
    res.status(500).json({ error: "Failed to search books" });
  }
});

// GET /api/books/search-google - Search Google Books API
router.get("/search-google", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    // Check if query is an ISBN
    const isbn = detectISBN(q);
    let results: BookSearchResult[];

    if (isbn) {
      // ISBN search (most precise)
      console.log(`[API] Searching Google Books by ISBN: ${isbn}`);
      const result = await searchBookByISBN(isbn);
      results = result ? [result] : [];
    } else {
      // Regular title/author search
      console.log(`[API] Searching Google Books by query: ${q}`);
      results = await searchGoogleBooks(q);
    }

    // Map to frontend format
    res.json({
      books: results.map((book) => ({
        googleBooksId: book.googleBooksId,
        title: book.title,
        author: book.author,
        description: book.description,
        coverUrl: book.coverUrl,
        genres: book.genres,
        publicationYear: book.publicationYear,
        isbn: book.isbn,
        pageCount: book.pageCount,
      })),
    });
  } catch (error) {
    console.error("Error searching Google Books:", error);

    // Check for rate limit error
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      res
        .status(429)
        .json({
          error: "Google Books rate limit exceeded. Please try again later.",
        });
      return;
    }

    res.status(500).json({ error: "Failed to search Google Books" });
  }
});

// GET /api/books/:id - Book detail with reviews
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    const book = await getBookById(id);

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    // Parse genres from JSON string
    const genres = book.genres ? JSON.parse(book.genres) : [];

    // Calculate sentiment breakdown
    const sentiments = book.reviews.reduce(
      (acc: { positive: number; negative: number; neutral: number }, r: { sentiment: string | null }) => {
        if (r.sentiment === "positive") acc.positive++;
        else if (r.sentiment === "negative") acc.negative++;
        else if (r.sentiment === "neutral") acc.neutral++;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
    );

    // Format reviews for response
    const reviews = book.reviews.map((review: {
      id: number;
      telegramDisplayName: string | null;
      telegramUsername: string | null;
      telegramUserId: bigint;
      reviewText: string;
      sentiment: string | null;
      reviewedAt: Date;
      messageId: bigint | null;
      chatId: bigint | null;
    }) => ({
      id: review.id,
      reviewerName: review.telegramDisplayName || review.telegramUsername || "Anonymous",
      reviewerUsername: review.telegramUsername,
      telegramUserId: review.telegramUserId.toString(),
      reviewText: review.reviewText,
      sentiment: review.sentiment,
      reviewedAt: review.reviewedAt.toISOString(),
      messageId: review.messageId?.toString(),
      chatId: review.chatId?.toString(),
    }));

    res.json({
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        coverUrl: book.coverUrl,
        genres,
        publicationYear: book.publicationYear,
        pageCount: book.pageCount,
        googleBooksUrl: getGoogleBooksUrl(book.googleBooksId),
        goodreadsUrl: generateGoodreadsUrl(book.isbn, book.title, book.author),
        reviewCount: book.reviews.length,
        sentiments,
      },
      reviews,
    });
  } catch (error) {
    console.error("Error fetching book:", error);
    res.status(500).json({ error: "Failed to fetch book" });
  }
});

// GET /api/books/:id/reviews - Get reviews for a book
router.get("/:id/reviews", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { sentiment, limit = "50", offset = "0" } = req.query;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || isNaN(parsedOffset) || parsedOffset < 0) {
      res.status(400).json({ error: "Invalid limit or offset parameter" });
      return;
    }

    const reviews = await getReviewsByBookId(id, {
      sentiment: sentiment as "positive" | "negative" | "neutral" | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    res.json({
      reviews: reviews.map((review: {
        id: number;
        telegramDisplayName: string | null;
        telegramUsername: string | null;
        telegramUserId: bigint;
        reviewText: string;
        sentiment: string | null;
        reviewedAt: Date;
        messageId: bigint | null;
        chatId: bigint | null;
      }) => ({
        id: review.id,
        reviewerName: review.telegramDisplayName || review.telegramUsername || "Anonymous",
        reviewerUsername: review.telegramUsername,
        telegramUserId: review.telegramUserId.toString(),
        reviewText: review.reviewText,
        sentiment: review.sentiment,
        reviewedAt: review.reviewedAt.toISOString(),
        messageId: review.messageId?.toString(),
        chatId: review.chatId?.toString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching book reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

export default router;
