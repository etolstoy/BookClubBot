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
