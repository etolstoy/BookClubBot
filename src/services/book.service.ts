import prisma from "../lib/prisma.js";
import { calculateSimilarity } from "../lib/string-utils.js";
import { searchBookWithFallbacks, searchBookByISBN } from "./googlebooks.js";
import { extractBookInfo, type ExtractedBookInfo } from "./llm.js";

/**
 * Compute Google Books URL from Google Books ID
 */
export function getGoogleBooksUrl(googleBooksId: string | null): string | null {
  return googleBooksId ? `https://books.google.com/books?id=${googleBooksId}` : null;
}

export interface CreateBookInput {
  title: string;
  author?: string | null;
  googleBooksId?: string | null;
  coverUrl?: string | null;
  genres?: string[];
  publicationYear?: number | null;
  description?: string | null;
  isbn?: string | null;
  pageCount?: number | null;
}

export interface UpdateBookInput {
  title?: string;
  author?: string | null;
  isbn?: string | null;
  description?: string | null;
  publicationYear?: number | null;
  pageCount?: number | null;
}

export async function findSimilarBook(
  title: string,
  author?: string | null
): Promise<{ id: number; title: string; author: string | null } | null> {
  const allBooks = await prisma.book.findMany({
    select: { id: true, title: true, author: true },
  });

  for (const book of allBooks) {
    const titleSimilarity = calculateSimilarity(title, book.title);

    if (titleSimilarity >= 0.85) {
      // If we have authors, check them too
      if (author && book.author) {
        const authorSimilarity = calculateSimilarity(author, book.author);
        if (authorSimilarity >= 0.7) {
          return book;
        }
      } else {
        // No author info to compare, just use title match
        return book;
      }
    }
  }

  return null;
}

export async function createBook(input: CreateBookInput) {
  return prisma.book.create({
    data: {
      title: input.title,
      author: input.author,
      googleBooksId: input.googleBooksId,
      coverUrl: input.coverUrl,
      genres: input.genres ? JSON.stringify(input.genres) : null,
      publicationYear: input.publicationYear,
      description: input.description,
      isbn: input.isbn,
      pageCount: input.pageCount,
    },
  });
}

export async function findOrCreateBook(
  title: string,
  author?: string | null,
  titleVariants?: string[],
  authorVariants?: string[]
): Promise<{ id: number; isNew: boolean }> {
  // First, try to find an existing similar book
  const existingBook = await findSimilarBook(title, author);
  if (existingBook) {
    return { id: existingBook.id, isNew: false };
  }

  // Search Google Books with cascading fallbacks
  const googleBook = await searchBookWithFallbacks(
    title,
    author || undefined,
    titleVariants,
    authorVariants
  );

  if (googleBook) {
    // Check if we already have this Google Books ID
    const existing = await prisma.book.findUnique({
      where: { googleBooksId: googleBook.googleBooksId },
    });

    if (existing) {
      return { id: existing.id, isNew: false };
    }

    // Create new book with Google Books data
    const book = await createBook({
      title: googleBook.title,
      author: googleBook.author,
      googleBooksId: googleBook.googleBooksId,
      coverUrl: googleBook.coverUrl,
      genres: googleBook.genres,
      publicationYear: googleBook.publicationYear,
      description: googleBook.description,
      isbn: googleBook.isbn,
      pageCount: googleBook.pageCount,
    });

    return { id: book.id, isNew: true };
  }

  // No Google Books result, create with basic info
  const book = await createBook({
    title,
    author,
  });

  return { id: book.id, isNew: true };
}

/**
 * Create book from ISBN (most reliable)
 */
export async function findOrCreateBookByISBN(
  isbn: string
): Promise<{ id: number; isNew: boolean } | null> {
  // Search Google Books by ISBN
  const googleBook = await searchBookByISBN(isbn);

  if (!googleBook) {
    return null;
  }

  // Check if we already have this Google Books ID
  const existing = await prisma.book.findUnique({
    where: { googleBooksId: googleBook.googleBooksId },
  });

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Create new book with Google Books data
  const book = await createBook({
    title: googleBook.title,
    author: googleBook.author,
    googleBooksId: googleBook.googleBooksId,
    coverUrl: googleBook.coverUrl,
    genres: googleBook.genres,
    publicationYear: googleBook.publicationYear,
    description: googleBook.description,
    isbn: googleBook.isbn,
    pageCount: googleBook.pageCount,
  });

  return { id: book.id, isNew: true };
}

/**
 * Find or create book from Google Books API data
 * Used when user selects a book from Google Books in the frontend
 */
export async function findOrCreateBookFromGoogleBooks(googleBooksData: {
  googleBooksId: string;
  title: string;
  author?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  genres?: string[];
  publicationYear?: number | null;
  isbn?: string | null;
  pageCount?: number | null;
}): Promise<{ id: number; isNew: boolean }> {
  // First check if book with this Google Books ID already exists
  const existingByGoogleId = await prisma.book.findUnique({
    where: { googleBooksId: googleBooksData.googleBooksId },
  });

  if (existingByGoogleId) {
    console.log(
      `[BookService] Found existing book by Google Books ID: ${googleBooksData.googleBooksId}`
    );
    return { id: existingByGoogleId.id, isNew: false };
  }

  // Check for similar book by title/author (avoid duplicates)
  const similar = await findSimilarBook(
    googleBooksData.title,
    googleBooksData.author
  );
  if (similar) {
    console.log(`[BookService] Found similar book: ${similar.title}`);
    return { id: similar.id, isNew: false };
  }

  // Create new book with Google Books data
  const book = await createBook({
    title: googleBooksData.title,
    author: googleBooksData.author,
    googleBooksId: googleBooksData.googleBooksId,
    coverUrl: googleBooksData.coverUrl,
    genres: googleBooksData.genres,
    publicationYear: googleBooksData.publicationYear,
    description: googleBooksData.description,
    isbn: googleBooksData.isbn,
    pageCount: googleBooksData.pageCount,
  });

  console.log(
    `[BookService] Created new book from Google Books: ${book.title}`
  );
  return { id: book.id, isNew: true };
}

export async function getBookById(id: number) {
  return prisma.book.findUnique({
    where: { id },
    include: {
      reviews: {
        orderBy: { reviewedAt: "desc" },
      },
    },
  });
}

export async function getBookWithReviewCount(id: number) {
  return prisma.book.findUnique({
    where: { id },
    include: {
      _count: {
        select: { reviews: true },
      },
    },
  });
}

/**
 * Update book metadata
 * If ISBN changed, automatically re-enrich from Google Books API
 */
export async function updateBook(id: number, input: UpdateBookInput) {
  // First, check if book exists and get current ISBN
  const existingBook = await prisma.book.findUnique({
    where: { id },
    select: { isbn: true },
  });

  if (!existingBook) {
    throw new Error(`Book with id ${id} not found`);
  }

  // Check if ISBN changed
  const isbnChanged = input.isbn !== undefined && input.isbn !== existingBook.isbn;

  // If ISBN changed, try to re-enrich from Google Books
  if (isbnChanged && input.isbn) {
    console.log(`[BookService] ISBN changed for book ${id}, attempting re-enrichment from Google Books`);

    const googleBook = await searchBookByISBN(input.isbn);

    if (googleBook) {
      console.log(`[BookService] Successfully re-enriched book ${id} from Google Books`);

      // Update with all Google Books data
      return prisma.book.update({
        where: { id },
        data: {
          title: googleBook.title,
          author: googleBook.author,
          isbn: googleBook.isbn,
          googleBooksId: googleBook.googleBooksId,
          coverUrl: googleBook.coverUrl,
          genres: googleBook.genres ? JSON.stringify(googleBook.genres) : null,
          description: googleBook.description,
          publicationYear: googleBook.publicationYear,
          pageCount: googleBook.pageCount,
        },
      });
    } else {
      console.log(`[BookService] No Google Books data found for ISBN ${input.isbn}, updating ISBN only`);

      // Update only the ISBN if Google Books returns nothing
      return prisma.book.update({
        where: { id },
        data: {
          isbn: input.isbn,
        },
      });
    }
  }

  // If ISBN not changed, update only the specified fields
  const updateData: Record<string, unknown> = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.author !== undefined) updateData.author = input.author;
  if (input.isbn !== undefined) updateData.isbn = input.isbn;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.publicationYear !== undefined) updateData.publicationYear = input.publicationYear;
  if (input.pageCount !== undefined) updateData.pageCount = input.pageCount;

  return prisma.book.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete book and cascade delete all associated reviews
 * Returns the deleted book info and count of deleted reviews
 */
export async function deleteBook(id: number): Promise<{ book: { id: number; title: string; author: string | null; isbn: string | null; googleBooksId: string | null }; deletedReviewsCount: number }> {
  return await prisma.$transaction(async (tx) => {
    // Fetch book details and review count before deletion
    const book = await tx.book.findUnique({
      where: { id },
      include: {
        _count: {
          select: { reviews: true },
        },
      },
    });

    if (!book) {
      throw new Error(`Book with id ${id} not found`);
    }

    const deletedReviewsCount = book._count.reviews;

    // Delete the book (reviews will cascade automatically due to schema change)
    await tx.book.delete({
      where: { id },
    });

    return {
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        googleBooksId: book.googleBooksId,
      },
      deletedReviewsCount,
    };
  });
}

export async function getAllBooks(options?: {
  sortBy?: "reviewCount" | "recentlyReviewed" | "alphabetical";
  genre?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const {
    sortBy = "recentlyReviewed",
    genre,
    search,
    limit = 50,
    offset = 0,
  } = options || {};

  const where: Record<string, unknown> = {};

  if (genre) {
    where.genres = { contains: genre };
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { author: { contains: search } },
    ];
  }

  let orderBy: Record<string, unknown>;

  switch (sortBy) {
    case "reviewCount":
      orderBy = { reviews: { _count: "desc" } };
      break;
    case "alphabetical":
      orderBy = { title: "asc" };
      break;
    case "recentlyReviewed":
    default:
      orderBy = { updatedAt: "desc" };
      break;
  }

  const books = await prisma.book.findMany({
    where,
    include: {
      _count: {
        select: { reviews: true },
      },
      reviews: {
        select: { sentiment: true },
      },
    },
    orderBy,
    take: limit,
    skip: offset,
  });

  return books.map((book: {
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
  });
}

export async function searchBooks(query: string, limit = 20) {
  // SQLite doesn't support case-insensitive search for Unicode/Cyrillic with COLLATE NOCASE
  // So we search with multiple case variants to handle both ASCII and Cyrillic
  const queryLower = query.toLowerCase();
  const queryUpper = query.toUpperCase();
  const queryTitle = query.charAt(0).toUpperCase() + query.slice(1).toLowerCase();

  const books = await prisma.$queryRaw<Array<{
    id: number;
    google_books_id: string | null;
    title: string;
    author: string | null;
    isbn: string | null;
    description: string | null;
    genres: string | null;
    publication_year: number | null;
    page_count: number | null;
    cover_url: string | null;
    created_at: Date;
    updated_at: Date;
  }>>`
    SELECT * FROM books
    WHERE title LIKE ${'%' + query + '%'}
       OR title LIKE ${'%' + queryLower + '%'}
       OR title LIKE ${'%' + queryUpper + '%'}
       OR title LIKE ${'%' + queryTitle + '%'}
       OR author LIKE ${'%' + query + '%'}
       OR author LIKE ${'%' + queryLower + '%'}
       OR author LIKE ${'%' + queryUpper + '%'}
       OR author LIKE ${'%' + queryTitle + '%'}
    LIMIT ${limit}
  `;

  // Fetch review counts and sentiments for each book
  const booksWithReviews = await Promise.all(
    books.map(async (book) => {
      const reviews = await prisma.review.findMany({
        where: { bookId: book.id },
        select: { sentiment: true },
      });

      // Map snake_case to camelCase
      return {
        id: book.id,
        googleBooksId: book.google_books_id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        description: book.description,
        genres: book.genres,
        publicationYear: book.publication_year,
        pageCount: book.page_count,
        coverUrl: book.cover_url,
        googleBooksUrl: getGoogleBooksUrl(book.google_books_id),
        createdAt: book.created_at,
        updatedAt: book.updated_at,
        reviews,
        _count: { reviews: reviews.length },
      };
    })
  );

  return booksWithReviews;
}

export async function processReviewText(reviewText: string): Promise<{
  bookId: number;
  isNewBook: boolean;
  bookTitle: string;
  bookInfo: ExtractedBookInfo;
} | null> {
  // Extract book info from review text using LLM
  const bookInfo = await extractBookInfo(reviewText);

  if (!bookInfo) {
    console.log("Could not extract book info from review");
    return null;
  }

  // Find or create the book using enhanced search with variants
  const { id, isNew } = await findOrCreateBook(
    bookInfo.title,
    bookInfo.author,
    bookInfo.titleVariants,
    bookInfo.authorVariants
  );

  const book = await prisma.book.findUnique({
    where: { id },
    select: { title: true },
  });

  return {
    bookId: id,
    isNewBook: isNew,
    bookTitle: book?.title || bookInfo.title,
    bookInfo,
  };
}

export async function mergeBooks(sourceId: number, targetId: number) {
  // Move all reviews from source book to target book
  await prisma.review.updateMany({
    where: { bookId: sourceId },
    data: { bookId: targetId },
  });

  // Delete the source book
  await prisma.book.delete({
    where: { id: sourceId },
  });

  return getBookById(targetId);
}
