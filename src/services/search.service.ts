import { prisma } from "../lib/prisma.js";

// Types for search results
export interface BookSearchResult {
  id: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  reviewCount: number;
  sentiments: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface AuthorSearchResult {
  name: string;
  bookCount: number;
  reviewCount: number;
}

export interface UserSearchResult {
  odId: string;
  displayName: string | null;
  username: string | null;
  reviewCount: number;
}

export interface ReviewSearchResult {
  id: number;
  text: string;
  sentiment: string | null;
  bookId: number | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  bookCoverUrl: string | null;
  reviewerName: string;
  reviewerId: string;
  reviewedAt: string;
}

export type SearchResult =
  | { type: "book"; data: BookSearchResult }
  | { type: "author"; data: AuthorSearchResult }
  | { type: "user"; data: UserSearchResult }
  | { type: "review"; data: ReviewSearchResult };

export interface UnifiedSearchResponse {
  results: SearchResult[];
  hasMore: boolean;
}

// Helper to generate case variants for Cyrillic support
function getCaseVariants(query: string): string[] {
  return [
    query,
    query.toLowerCase(),
    query.toUpperCase(),
    query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
  ];
}

/**
 * Search books by title or author
 */
export async function searchBooks(
  query: string,
  limit: number,
  offset: number
): Promise<BookSearchResult[]> {
  const variants = getCaseVariants(query);

  const books = await prisma.$queryRaw<
    Array<{
      id: number;
      title: string;
      author: string | null;
      cover_url: string | null;
    }>
  >`
    SELECT id, title, author, cover_url
    FROM books
    WHERE title LIKE ${"%" + variants[0] + "%"}
       OR title LIKE ${"%" + variants[1] + "%"}
       OR title LIKE ${"%" + variants[2] + "%"}
       OR title LIKE ${"%" + variants[3] + "%"}
       OR author LIKE ${"%" + variants[0] + "%"}
       OR author LIKE ${"%" + variants[1] + "%"}
       OR author LIKE ${"%" + variants[2] + "%"}
       OR author LIKE ${"%" + variants[3] + "%"}
    ORDER BY title ASC, id ASC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  // Fetch review counts and sentiments for each book
  const results = await Promise.all(
    books.slice(0, limit).map(async (book) => {
      const reviews = await prisma.review.findMany({
        where: { bookId: book.id },
        select: { sentiment: true },
      });

      const sentiments = reviews.reduce(
        (acc, r) => {
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
        coverUrl: book.cover_url,
        reviewCount: reviews.length,
        sentiments,
      };
    })
  );

  return results;
}

/**
 * Search authors by name (aggregated from books)
 */
export async function searchAuthors(
  query: string,
  limit: number,
  offset: number
): Promise<AuthorSearchResult[]> {
  const variants = getCaseVariants(query);

  // Get all matching authors with their book counts
  const authorsRaw = await prisma.$queryRaw<
    Array<{
      author: string;
      book_count: number;
    }>
  >`
    SELECT author, COUNT(*) as book_count
    FROM books
    WHERE author IS NOT NULL
      AND author != ''
      AND (
        author LIKE ${"%" + variants[0] + "%"}
        OR author LIKE ${"%" + variants[1] + "%"}
        OR author LIKE ${"%" + variants[2] + "%"}
        OR author LIKE ${"%" + variants[3] + "%"}
      )
    GROUP BY author
    ORDER BY book_count DESC, author ASC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  // Fetch review counts for each author
  const results = await Promise.all(
    authorsRaw.slice(0, limit).map(async (row) => {
      const reviewCount = await prisma.review.count({
        where: {
          book: {
            author: row.author,
          },
        },
      });

      return {
        name: row.author,
        bookCount: Number(row.book_count),
        reviewCount,
      };
    })
  );

  return results;
}

/**
 * Search users by display name or username (aggregated from reviews)
 */
export async function searchUsers(
  query: string,
  limit: number,
  offset: number
): Promise<UserSearchResult[]> {
  const variants = getCaseVariants(query);

  const usersRaw = await prisma.$queryRaw<
    Array<{
      telegram_user_id: bigint;
      telegram_display_name: string | null;
      telegram_username: string | null;
      review_count: number;
    }>
  >`
    SELECT
      telegram_user_id,
      MAX(telegram_display_name) as telegram_display_name,
      MAX(telegram_username) as telegram_username,
      COUNT(*) as review_count
    FROM reviews
    WHERE (
      telegram_display_name LIKE ${"%" + variants[0] + "%"}
      OR telegram_display_name LIKE ${"%" + variants[1] + "%"}
      OR telegram_display_name LIKE ${"%" + variants[2] + "%"}
      OR telegram_display_name LIKE ${"%" + variants[3] + "%"}
      OR telegram_username LIKE ${"%" + variants[0] + "%"}
      OR telegram_username LIKE ${"%" + variants[1] + "%"}
      OR telegram_username LIKE ${"%" + variants[2] + "%"}
      OR telegram_username LIKE ${"%" + variants[3] + "%"}
    )
    GROUP BY telegram_user_id
    ORDER BY review_count DESC, telegram_user_id ASC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  return usersRaw.slice(0, limit).map((row) => ({
    odId: row.telegram_user_id.toString(),
    displayName: row.telegram_display_name,
    username: row.telegram_username,
    reviewCount: Number(row.review_count),
  }));
}

/**
 * Search reviews by text content
 */
export async function searchReviews(
  query: string,
  limit: number,
  offset: number
): Promise<ReviewSearchResult[]> {
  const variants = getCaseVariants(query);

  const reviewsRaw = await prisma.$queryRaw<
    Array<{
      id: number;
      review_text: string;
      sentiment: string | null;
      book_id: number | null;
      telegram_user_id: bigint;
      telegram_display_name: string | null;
      telegram_username: string | null;
      reviewed_at: Date;
    }>
  >`
    SELECT
      id,
      review_text,
      sentiment,
      book_id,
      telegram_user_id,
      telegram_display_name,
      telegram_username,
      reviewed_at
    FROM reviews
    WHERE review_text LIKE ${"%" + variants[0] + "%"}
       OR review_text LIKE ${"%" + variants[1] + "%"}
       OR review_text LIKE ${"%" + variants[2] + "%"}
       OR review_text LIKE ${"%" + variants[3] + "%"}
    ORDER BY reviewed_at DESC, id DESC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  // Fetch book info for reviews that have books
  const results = await Promise.all(
    reviewsRaw.slice(0, limit).map(async (row) => {
      let bookTitle: string | null = null;
      let bookAuthor: string | null = null;
      let bookCoverUrl: string | null = null;

      if (row.book_id) {
        const book = await prisma.book.findUnique({
          where: { id: row.book_id },
          select: { title: true, author: true, coverUrl: true },
        });
        if (book) {
          bookTitle = book.title;
          bookAuthor = book.author;
          bookCoverUrl = book.coverUrl;
        }
      }

      const reviewerName =
        row.telegram_display_name || row.telegram_username || "Anonymous";

      return {
        id: row.id,
        text: row.review_text,
        sentiment: row.sentiment,
        bookId: row.book_id,
        bookTitle,
        bookAuthor,
        bookCoverUrl,
        reviewerName,
        reviewerId: row.telegram_user_id.toString(),
        reviewedAt: row.reviewed_at.toISOString(),
      };
    })
  );

  return results;
}

/**
 * Unified search across all entity types
 * Returns results ordered by type priority: authors -> books -> users -> reviews
 */
export async function searchAll(
  query: string,
  limit: number,
  offset: number
): Promise<UnifiedSearchResponse> {
  // For "all" search, we need to handle pagination across types
  // Strategy: fetch all types, combine, slice by offset/limit

  // Fetch more than needed from each type to ensure we have enough
  const fetchLimit = limit + offset + 1;

  const [books, authors, users, reviews] = await Promise.all([
    searchBooks(query, fetchLimit, 0),
    searchAuthors(query, fetchLimit, 0),
    searchUsers(query, fetchLimit, 0),
    searchReviews(query, fetchLimit, 0),
  ]);

  // Combine results in type priority order: authors first
  const allResults: SearchResult[] = [
    ...authors.map((data) => ({ type: "author" as const, data })),
    ...books.map((data) => ({ type: "book" as const, data })),
    ...users.map((data) => ({ type: "user" as const, data })),
    ...reviews.map((data) => ({ type: "review" as const, data })),
  ];

  // Apply offset and limit
  const paginatedResults = allResults.slice(offset, offset + limit);
  const hasMore = allResults.length > offset + limit;

  return {
    results: paginatedResults,
    hasMore,
  };
}

/**
 * Search with type filter
 */
export async function search(
  query: string,
  type: "all" | "books" | "authors" | "users" | "reviews",
  limit: number,
  offset: number
): Promise<UnifiedSearchResponse> {
  if (type === "all") {
    return searchAll(query, limit, offset);
  }

  let results: SearchResult[];
  let hasMore = false;

  switch (type) {
    case "books": {
      const books = await searchBooks(query, limit + 1, offset);
      hasMore = books.length > limit;
      results = books
        .slice(0, limit)
        .map((data) => ({ type: "book" as const, data }));
      break;
    }
    case "authors": {
      const authors = await searchAuthors(query, limit + 1, offset);
      hasMore = authors.length > limit;
      results = authors
        .slice(0, limit)
        .map((data) => ({ type: "author" as const, data }));
      break;
    }
    case "users": {
      const users = await searchUsers(query, limit + 1, offset);
      hasMore = users.length > limit;
      results = users
        .slice(0, limit)
        .map((data) => ({ type: "user" as const, data }));
      break;
    }
    case "reviews": {
      const reviews = await searchReviews(query, limit + 1, offset);
      hasMore = reviews.length > limit;
      results = reviews
        .slice(0, limit)
        .map((data) => ({ type: "review" as const, data }));
      break;
    }
  }

  return { results, hasMore };
}
