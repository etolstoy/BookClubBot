import { Router } from "express";
import {
  getAllBooks,
  getBookById,
  searchBooks,
  createBook,
  updateBook,
  deleteBook,
} from "../../services/book.service.js";
import { getReviewsByBookId, isAdmin, isChatMember } from "../../services/review.service.js";
import { authenticateTelegramWebApp } from "../middleware/telegram-auth.js";
import { sendInfoNotification } from "../../services/notification.service.js";
import { createBookDataClient } from "../../clients/book-data/factory.js";
import type { BookSearchResult } from "../../lib/interfaces/index.js";
import { getGoogleBooksUrl, generateGoodreadsUrl } from "../../lib/url-utils.js";
import { detectISBN } from "../../lib/isbn-utils.js";
import { config } from "../../lib/config.js";

const router = Router();

// GET /api/books - List all books
router.get("/", async (req, res) => {
  try {
    const {
      sortBy,
      genre,
      search,
      needsHelp,
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
      needsHelp: needsHelp === "true",
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

// GET /api/books/search-google - Search External Book API
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
    const bookDataClient = createBookDataClient();

    if (isbn) {
      // ISBN search (most precise)
      console.log(`[API] Searching external book API by ISBN: ${isbn}`);
      const result = await bookDataClient.searchBookByISBN(isbn);
      results = result ? [result] : [];
    } else {
      // Regular title/author search
      console.log(`[API] Searching external book API by query: ${q}`);
      results = await bookDataClient.searchBooks(q);
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
    console.error("Error searching external book API:", error);

    // Check for rate limit error
    if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
      res
        .status(429)
        .json({
          error: "External book API rate limit exceeded. Please try again later.",
        });
      return;
    }

    res.status(500).json({ error: "Failed to search external book API" });
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
        goodreadsUrl: book.goodreadsUrl || generateGoodreadsUrl(book.isbn, book.title, book.author),
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

// POST /api/books - Create new book (all authenticated users)
router.post("/", authenticateTelegramWebApp, async (req, res) => {
  try {
    const { title, author, isbn, coverUrl, description, publicationYear, pageCount } = req.body;

    console.log('[POST /api/books] Request body:', JSON.stringify(req.body, null, 2));

    // Validate required fields
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required and cannot be empty" });
      return;
    }

    // Create book
    const book = await createBook({
      title: title.trim(),
      author: author || null,
      isbn: isbn || null,
      coverUrl: coverUrl || null,
      description: description || null,
      publicationYear: publicationYear || null,
      pageCount: pageCount || null,
    });

    console.log('[POST /api/books] Book created:', book);

    // Send notification to admin
    const userName = req.telegramUser!.username || req.telegramUser!.first_name || "Unknown User";
    await sendInfoNotification(
      `📘 New book created by @${userName}`,
      {
        operation: "Book Creation",
        additionalInfo: `Book: "${book.title}"${book.author ? ` by ${book.author}` : ""}\nISBN: ${book.isbn || "none"}`,
      }
    );

    // Format response with genres parsed
    const genres = book.genres ? JSON.parse(book.genres) : [];

    res.status(201).json({
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
        reviewCount: 0,
        sentiments: { positive: 0, negative: 0, neutral: 0 },
      },
      message: "Book created successfully",
    });
  } catch (error) {
    console.error("Error creating book:", error);
    res.status(500).json({ error: "Failed to create book" });
  }
});

// PATCH /api/books/:id - Update book metadata (admin or chat member)
router.patch("/:id", authenticateTelegramWebApp, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const { title, author, isbn, coverUrl, description, publicationYear, pageCount, goodreadsUrl } = req.body;

    // Debug logging
    console.log('[PATCH /api/books/:id] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[PATCH /api/books/:id] Parsed fields:', { title, author, isbn, coverUrl, description, publicationYear, pageCount, goodreadsUrl });

    if (isNaN(bookId)) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    // Check authorization (admin or chat member)
    const userIsAdmin = isAdmin(req.telegramUser!.id);
    const userIsChatMember = isChatMember(req.telegramUser!);

    if (!userIsAdmin && !userIsChatMember) {
      res.status(403).json({ error: "Chat membership required" });
      return;
    }

    // Validate at least one field provided
    if (
      title === undefined &&
      author === undefined &&
      isbn === undefined &&
      coverUrl === undefined &&
      description === undefined &&
      publicationYear === undefined &&
      pageCount === undefined &&
      goodreadsUrl === undefined
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

    console.log('[PATCH /api/books/:id] Existing book:', {
      title: existingBook.title,
      author: existingBook.author,
      isbn: existingBook.isbn
    });

    // Build update data - only include fields that were actually provided
    const updateData: any = {};

    if (title !== undefined) {
      updateData.title = title.trim();
    }
    if (author !== undefined) {
      updateData.author = author.trim() || null;
    }
    if (isbn !== undefined) {
      updateData.isbn = isbn || null;
    }
    if (coverUrl !== undefined) {
      updateData.coverUrl = coverUrl || null;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (publicationYear !== undefined) {
      updateData.publicationYear = publicationYear;
    }
    if (pageCount !== undefined) {
      updateData.pageCount = pageCount;
    }
    if (goodreadsUrl !== undefined) {
      updateData.goodreadsUrl = goodreadsUrl || null;
    }

    console.log('[PATCH /api/books/:id] Update data being sent to service:', updateData);

    // Update book
    const updatedBook = await updateBook(bookId, updateData);

    // Send admin notification with before/after
    const editorInfo = `@${req.telegramUser!.username || 'unknown'} (${req.telegramUser!.first_name || 'Unknown'}, ID: ${req.telegramUser!.id})`;
    const notificationHeader = userIsAdmin ? 'Admin' : 'Volunteer';

    const changes: string[] = [];
    if (title !== undefined && existingBook.title !== updatedBook.title) {
      changes.push(`• Title: "${existingBook.title}" → "${updatedBook.title}"`);
    }
    if (author !== undefined && existingBook.author !== updatedBook.author) {
      changes.push(`• Author: ${existingBook.author || 'empty'} → ${updatedBook.author || 'empty'}`);
    }
    if (isbn !== undefined && existingBook.isbn !== updatedBook.isbn) {
      changes.push(`• ISBN: ${existingBook.isbn || 'empty'} → ${updatedBook.isbn || 'empty'}`);
    }
    if (coverUrl !== undefined && existingBook.coverUrl !== updatedBook.coverUrl) {
      changes.push(`• Cover: ${existingBook.coverUrl ? 'set' : 'empty'} → ${updatedBook.coverUrl ? 'set' : 'empty'}`);
    }
    if (description !== undefined && existingBook.description !== updatedBook.description) {
      const oldDesc = existingBook.description ? existingBook.description.slice(0, 50) + '...' : 'empty';
      const newDesc = updatedBook.description ? updatedBook.description.slice(0, 50) + '...' : 'empty';
      changes.push(`• Description: ${oldDesc} → ${newDesc}`);
    }
    if (publicationYear !== undefined && existingBook.publicationYear !== updatedBook.publicationYear) {
      changes.push(`• Publication Year: ${existingBook.publicationYear || 'empty'} → ${updatedBook.publicationYear || 'empty'}`);
    }
    if (pageCount !== undefined && existingBook.pageCount !== updatedBook.pageCount) {
      changes.push(`• Page Count: ${existingBook.pageCount || 'empty'} → ${updatedBook.pageCount || 'empty'}`);
    }
    if (goodreadsUrl !== undefined && existingBook.goodreadsUrl !== updatedBook.goodreadsUrl) {
      changes.push(`• Goodreads URL: ${existingBook.goodreadsUrl ? 'set' : 'empty'} → ${updatedBook.goodreadsUrl ? 'set' : 'empty'}`);
    }

    if (changes.length > 0) {
      await sendInfoNotification(
        `📝 Book Edited by ${notificationHeader}\n\nEditor: ${editorInfo}\n\nBook: "${updatedBook.title}"\n\nChanges:\n${changes.join('\n')}\n\n🔗 View: ${config.miniAppUrl}?startapp=book_${bookId}\n\n⏰ ${new Date().toISOString()}`,
        { operation: 'Book Update' }
      );
    }

    // Fetch the book with reviews to get accurate counts and sentiments
    const bookWithReviews = await getBookById(bookId);

    if (!bookWithReviews) {
      res.status(404).json({ error: "Book not found after update" });
      return;
    }

    // Calculate sentiment breakdown
    const sentiments = bookWithReviews.reviews.reduce(
      (acc: { positive: number; negative: number; neutral: number }, r: { sentiment: string | null }) => {
        if (r.sentiment === "positive") acc.positive++;
        else if (r.sentiment === "negative") acc.negative++;
        else if (r.sentiment === "neutral") acc.neutral++;
        return acc;
      },
      { positive: 0, negative: 0, neutral: 0 }
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
        isbn: updatedBook.isbn,
        pageCount: updatedBook.pageCount,
        googleBooksUrl: getGoogleBooksUrl(updatedBook.googleBooksId),
        goodreadsUrl: updatedBook.goodreadsUrl || generateGoodreadsUrl(updatedBook.isbn, updatedBook.title, updatedBook.author),
        reviewCount: bookWithReviews.reviews.length,
        sentiments,
      },
      message: "Book updated successfully",
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
