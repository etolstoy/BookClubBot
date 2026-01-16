import { prisma } from "../lib/prisma.js";

export interface AuthorLeaderboardEntry {
  rank: number;
  author: string;
  reviewCount: number;
}

/**
 * Get popular authors ranked by total review count across all their books
 * @param limit - Number of authors to return
 * @param offset - Starting position for pagination
 * @param minReviews - Minimum number of reviews required to include author (default: 1)
 * @returns Array of author leaderboard entries with rank, name, and review count
 */
export async function getPopularAuthors(
  limit: number,
  offset: number,
  minReviews: number = 1
): Promise<AuthorLeaderboardEntry[]> {
  // Fetch all books with their review counts
  const booksWithReviews = await prisma.book.findMany({
    where: {
      AND: [
        { author: { not: null } },
        { author: { not: "" } },
      ],
      reviews: {
        some: {}, // Only books that have at least one review
      },
    },
    include: {
      _count: {
        select: {
          reviews: true,
        },
      },
    },
  });

  // Group by author and sum review counts
  const authorMap = new Map<string, number>();

  for (const book of booksWithReviews) {
    if (!book.author) continue;

    const authorName = book.author.trim();
    if (!authorName) continue;

    const currentCount = authorMap.get(authorName) || 0;
    authorMap.set(authorName, currentCount + book._count.reviews);
  }

  // Convert to array, filter by minReviews, sort, and paginate
  const authors = Array.from(authorMap.entries())
    .map(([author, reviewCount]) => ({
      author,
      reviewCount,
    }))
    .filter((entry) => entry.reviewCount >= minReviews)
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(offset, offset + limit)
    .map((entry, index) => ({
      rank: offset + index + 1,
      author: entry.author,
      reviewCount: entry.reviewCount,
    }));

  return authors;
}

/**
 * Get books by a specific author with pagination
 * @param authorName - Exact author name to search for (case-insensitive)
 * @param limit - Number of books to return
 * @param offset - Starting position for pagination
 * @returns Array of books by the specified author with review counts and sentiments
 */
export async function getBooksByAuthor(
  authorName: string,
  limit: number,
  offset: number
) {
  // Use raw SQL for case-insensitive exact match with proper pagination
  // SQLite doesn't support Prisma's mode: "insensitive" for string filters
  const books = await prisma.$queryRaw<Array<{
    id: number;
    title: string;
    author: string | null;
    cover_url: string | null;
    genres: string | null;
    publication_year: number | null;
  }>>`
    SELECT id, title, author, cover_url, genres, publication_year
    FROM books
    WHERE author = ${authorName} COLLATE NOCASE
    ORDER BY (
      SELECT COUNT(*) FROM reviews WHERE reviews.book_id = books.id
    ) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  // Fetch review counts and sentiments for each book
  const booksWithReviews = await Promise.all(
    books.map(async (book) => {
      const reviews = await prisma.review.findMany({
        where: { bookId: book.id },
        select: { sentiment: true },
      });

      const sentiments = reviews.reduce(
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
        coverUrl: book.cover_url,
        genres: book.genres ? JSON.parse(book.genres) : [],
        publicationYear: book.publication_year,
        reviewCount: reviews.length,
        sentiments,
      };
    })
  );

  return booksWithReviews;
}
