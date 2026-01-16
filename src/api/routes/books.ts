import { Router } from "express";
import {
  getAllBooks,
  getBookById,
  searchBooks,
  getGoogleBooksUrl,
  updateBook,
  deleteBook,
} from "../../services/book.service.js";
import { getReviewsByBookId, isAdmin } from "../../services/review.service.js";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";
import { sendInfoNotification } from "../../services/notification.service.js";
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
        isbn: book.isbn,
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

// PATCH /api/books/:id - Update book metadata (admin only)
router.patch("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const { title, author, isbn, description, publicationYear, pageCount } = req.body;

    if (isNaN(bookId)) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    // Check admin authorization
    const userIsAdmin = isAdmin(req.telegramUser!.id);
    if (!userIsAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    // Validate at least one field provided
    if (
      title === undefined &&
      author === undefined &&
      isbn === undefined &&
      description === undefined &&
      publicationYear === undefined &&
      pageCount === undefined
    ) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Validate title not empty if provided
    if (title !== undefined && title.trim().length === 0) {
      res.status(400).json({ error: "Title cannot be empty" });
      return;
    }

    // Check book exists
    const existingBook = await getBookById(bookId);
    if (!existingBook) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    // Track ISBN change for enrichment
    const isbnChanged = isbn !== undefined && isbn !== existingBook.isbn;
    const oldIsbn = existingBook.isbn;

    // Update book
    const updatedBook = await updateBook(bookId, {
      title: title?.trim(),
      author: author?.trim() || null,
      isbn: isbn || null,
      description,
      publicationYear,
      pageCount,
    });

    // Send admin notification
    const userName = req.telegramUser!.username || req.telegramUser!.first_name || "Unknown Admin";

    const changes: string[] = [];
    if (title !== undefined) changes.push("title");
    if (author !== undefined) changes.push("author");
    if (isbn !== undefined) changes.push("isbn");
    if (description !== undefined) changes.push("description");
    if (publicationYear !== undefined) changes.push("publication year");
    if (pageCount !== undefined) changes.push("page count");

    await sendInfoNotification(
      `Book #${bookId} updated by admin @${userName}`,
      {
        operation: "Book Update (ADMIN)",
        additionalInfo: `Book: "${updatedBook.title}" by ${updatedBook.author || "Unknown"}\nChanges: ${changes.join(", ")}${
          isbnChanged
            ? `\nISBN changed: ${oldIsbn || "none"} → ${isbn}\n${
                updatedBook.googleBooksId
                  ? "✓ Re-enriched from Google Books"
                  : "✗ No Google Books data found"
              }`
            : ""
        }`,
      }
    );

    // Format response with genres parsed
    const genres = updatedBook.genres ? JSON.parse(updatedBook.genres) : [];

    res.json({
      book: {
        id: updatedBook.id,
        title: updatedBook.title,
        author: updatedBook.author,
        description: updatedBook.description,
        coverUrl: updatedBook.coverUrl,
        genres,
        publicationYear: updatedBook.publicationYear,
        pageCount: updatedBook.pageCount,
        googleBooksUrl: getGoogleBooksUrl(updatedBook.googleBooksId),
        goodreadsUrl: generateGoodreadsUrl(updatedBook.isbn, updatedBook.title, updatedBook.author),
        reviewCount: 0, // Not relevant for update response
        sentiments: { positive: 0, negative: 0, neutral: 0 }, // Not relevant for update response
      },
      message:
        isbnChanged && updatedBook.googleBooksId
          ? "Book updated and re-enriched from Google Books"
          : "Book updated successfully",
    });
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).json({ error: "Failed to update book" });
  }
});

// DELETE /api/books/:id - Delete book and cascade delete reviews (admin only)
router.delete("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);

    if (isNaN(bookId)) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    // Check admin authorization
    const userIsAdmin = isAdmin(req.telegramUser!.id);
    if (!userIsAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    // Check book exists
    const existingBook = await getBookById(bookId);
    if (!existingBook) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    // Get review count for notification
    const reviewCount = existingBook.reviews.length;

    // Delete book (reviews cascade automatically)
    const { book, deletedReviewsCount } = await deleteBook(bookId);

    // Send admin notification
    const userName = req.telegramUser!.username || req.telegramUser!.first_name || "Unknown Admin";

    await sendInfoNotification(
      `📕 Book Deleted (ADMIN)\n\nBook: "${book.title}"${
        book.author ? ` by ${book.author}` : ""
      }\nDeleted by: @${userName}\nReviews deleted: ${deletedReviewsCount}`,
      {
        operation: "Book Deletion (ADMIN)",
        additionalInfo: `Book ID: ${bookId}\nISBN: ${book.isbn || "none"}\nGoogle Books ID: ${
          book.googleBooksId || "none"
        }`,
      }
    );

    // Return success
    res.json({
      success: true,
      message: `Book deleted successfully. ${deletedReviewsCount} review(s) were also deleted.`,
      deletedReviewsCount,
    });
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ error: "Failed to delete book" });
  }
});

export default router;
