import prisma from "../lib/prisma.js";
import { searchBookByTitleAndAuthor, searchBookWithFallbacks, searchBookByISBN, type BookSearchResult } from "./googlebooks.js";
import { extractBookInfo, type ExtractedBookInfo } from "./llm.js";

export interface CreateBookInput {
  title: string;
  author?: string | null;
  googleBooksId?: string | null;
  googleBooksUrl?: string | null;
  coverUrl?: string | null;
  genres?: string[];
  publicationYear?: number | null;
  description?: string | null;
  isbn?: string | null;
  pageCount?: number | null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeTitle(str1);
  const s2 = normalizeTitle(str2);

  if (s1 === s2) return 1;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  // Levenshtein distance
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }

  return (longer.length - costs[s2.length]) / longer.length;
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
      googleBooksUrl: input.googleBooksUrl,
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
      googleBooksUrl: googleBook.googleBooksUrl,
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
    googleBooksUrl: googleBook.googleBooksUrl,
    coverUrl: googleBook.coverUrl,
    genres: googleBook.genres,
    publicationYear: googleBook.publicationYear,
    description: googleBook.description,
    isbn: googleBook.isbn,
    pageCount: googleBook.pageCount,
  });

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
    google_books_url: string | null;
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
        googleBooksUrl: book.google_books_url,
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
