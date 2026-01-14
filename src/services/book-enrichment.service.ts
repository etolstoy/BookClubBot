import prisma from "../lib/prisma.js";
import { searchBooks } from "./googlebooks.js";
import type {
  ExtractedBookInfo,
  EnrichedBook,
  EnrichmentResult,
} from "../bot/types/confirmation-state.js";

/**
 * Normalize string for similarity comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Levenshtein similarity between two strings
 * Returns a value between 0 (completely different) and 1 (identical)
 * Reused from src/services/book.service.ts (lines 26-59)
 */
export function calculateStrictSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

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

/**
 * Search local database for books matching title and author with 90% similarity threshold
 * BOTH title AND author must be ≥90% independently
 */
export async function searchLocalBooks(
  title: string,
  author: string | null,
  threshold: number = 0.9
): Promise<EnrichedBook[]> {
  const allBooks = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      coverUrl: true,
      googleBooksId: true,
    },
  });

  const matches: EnrichedBook[] = [];

  for (const book of allBooks) {
    const titleSimilarity = calculateStrictSimilarity(title, book.title);

    // Title must meet threshold
    if (titleSimilarity < threshold) {
      continue;
    }

    // If we have authors, BOTH must meet threshold independently
    if (author && book.author) {
      const authorSimilarity = calculateStrictSimilarity(author, book.author);
      if (authorSimilarity < threshold) {
        continue; // Author doesn't meet threshold, skip this book
      }

      // Both title and author meet threshold
      matches.push({
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        coverUrl: book.coverUrl,
        googleBooksId: book.googleBooksId,
        source: "local",
        similarity: {
          title: titleSimilarity,
          author: authorSimilarity,
        },
      });
    } else if (!author || !book.author) {
      // No author to compare, just use title match
      matches.push({
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        coverUrl: book.coverUrl,
        googleBooksId: book.googleBooksId,
        source: "local",
        similarity: {
          title: titleSimilarity,
          author: 1.0, // No author comparison
        },
      });
    }
  }

  // Sort by combined similarity score (title + author average)
  matches.sort((a, b) => {
    const scoreA = (a.similarity.title + a.similarity.author) / 2;
    const scoreB = (b.similarity.title + b.similarity.author) / 2;
    return scoreB - scoreA;
  });

  return matches;
}

/**
 * Search Google Books and filter results with 90% similarity threshold
 * BOTH title AND author must be ≥90% independently
 */
export async function searchGoogleBooksWithThreshold(
  title: string,
  author: string | null,
  threshold: number = 0.9
): Promise<EnrichedBook[]> {
  try {
    // Build query for Google Books
    let query = `intitle:${title}`;
    if (author) {
      query += `+inauthor:${author}`;
    }

    const results = await searchBooks(query);
    const matches: EnrichedBook[] = [];

    for (const result of results) {
      const titleSimilarity = calculateStrictSimilarity(title, result.title);

      // Title must meet threshold
      if (titleSimilarity < threshold) {
        continue;
      }

      // If we have authors, BOTH must meet threshold independently
      if (author && result.author) {
        const authorSimilarity = calculateStrictSimilarity(author, result.author);
        if (authorSimilarity < threshold) {
          continue; // Author doesn't meet threshold, skip this result
        }

        // Both title and author meet threshold
        matches.push({
          title: result.title,
          author: result.author,
          isbn: result.isbn,
          coverUrl: result.coverUrl,
          googleBooksId: result.googleBooksId,
          source: "google",
          similarity: {
            title: titleSimilarity,
            author: authorSimilarity,
          },
        });
      } else if (!author || !result.author) {
        // No author to compare, just use title match
        matches.push({
          title: result.title,
          author: result.author,
          isbn: result.isbn,
          coverUrl: result.coverUrl,
          googleBooksId: result.googleBooksId,
          source: "google",
          similarity: {
            title: titleSimilarity,
            author: 1.0, // No author comparison
          },
        });
      }
    }

    // Sort by combined similarity score
    matches.sort((a, b) => {
      const scoreA = (a.similarity.title + a.similarity.author) / 2;
      const scoreB = (b.similarity.title + b.similarity.author) / 2;
      return scoreB - scoreA;
    });

    // Return top 3 matches
    return matches.slice(0, 3);
  } catch (error) {
    console.error("[Book Enrichment] Error searching Google Books:", error);
    return [];
  }
}

/**
 * Enrich extracted book information with local DB and Google Books data
 * Process primary book + alternatives (up to 3 total)
 * Priority: Local DB first, only try Google Books if NO local matches found
 */
export async function enrichBookInfo(
  extractedInfo: ExtractedBookInfo
): Promise<EnrichmentResult> {
  // Collect all books to enrich (primary + alternatives, max 3 total)
  const booksToEnrich: Array<{ title: string; author: string | null }> = [
    { title: extractedInfo.title, author: extractedInfo.author },
  ];

  // Add alternatives (up to 2 more for total of 3)
  if (extractedInfo.alternativeBooks && extractedInfo.alternativeBooks.length > 0) {
    const alternativesToAdd = extractedInfo.alternativeBooks.slice(0, 2);
    booksToEnrich.push(...alternativesToAdd);
  }

  console.log(
    `[Book Enrichment] Enriching ${booksToEnrich.length} books (primary + alternatives)`
  );

  // Step 1: Try local DB for ALL books
  const localMatches: EnrichedBook[] = [];
  for (const book of booksToEnrich) {
    const matches = await searchLocalBooks(book.title, book.author);
    localMatches.push(...matches);
  }

  // If ANY local matches found, return them immediately (don't try Google Books)
  if (localMatches.length > 0) {
    console.log(`[Book Enrichment] Found ${localMatches.length} local matches`);
    // Remove duplicates by book ID and limit to 3
    const uniqueLocalMatches = Array.from(
      new Map(localMatches.map((book) => [book.id, book])).values()
    ).slice(0, 3);

    return {
      source: "local",
      matches: uniqueLocalMatches,
    };
  }

  console.log("[Book Enrichment] No local matches, trying Google Books");

  // Step 2: No local matches, try Google Books for ALL books
  const googleMatches: EnrichedBook[] = [];
  for (const book of booksToEnrich) {
    const matches = await searchGoogleBooksWithThreshold(book.title, book.author);
    googleMatches.push(...matches);
  }

  if (googleMatches.length > 0) {
    console.log(`[Book Enrichment] Found ${googleMatches.length} Google Books matches`);
    // Remove duplicates by googleBooksId and limit to 3
    const uniqueGoogleMatches = Array.from(
      new Map(googleMatches.map((book) => [book.googleBooksId, book])).values()
    ).slice(0, 3);

    return {
      source: "google",
      matches: uniqueGoogleMatches,
    };
  }

  console.log("[Book Enrichment] No matches found anywhere");

  // Step 3: No matches found anywhere
  return {
    source: "none",
    matches: [],
  };
}
