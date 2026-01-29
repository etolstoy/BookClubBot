import prisma from "../lib/prisma.js";
import { calculateSimilarity, normalizeString } from "../lib/string-utils.js";
import { createBookDataClient } from "../clients/book-data/factory.js";
import type { PrismaClient } from "@prisma/client";
import type { IBookDataClient } from "../lib/interfaces/index.js";
import type {
  ExtractedBookInfo,
  EnrichedBook,
  EnrichmentResult,
} from "../bot/types/confirmation-state.js";

/**
 * Search local database for books matching title and author with 90% similarity threshold
 * BOTH title AND author must be ≥90% independently
 * @param prismaClient - Optional Prisma client for testing (defaults to global instance)
 */
export async function searchLocalBooks(
  title: string,
  author: string | null,
  threshold: number = 0.9,
  prismaClient?: PrismaClient
): Promise<EnrichedBook[]> {
  const db = prismaClient || prisma;
  const allBooks = await db.book.findMany({
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
    const titleSimilarity = calculateSimilarity(title, book.title);

    // Title must meet threshold
    if (titleSimilarity < threshold) {
      continue;
    }

    // If we have authors, BOTH must meet threshold independently
    if (author && book.author) {
      const authorSimilarity = calculateSimilarity(author, book.author);
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
 * Search external book API and filter results with 90% similarity threshold
 * BOTH title AND author must be ≥90% independently
 * @param bookDataClient - Optional book data client for testing (defaults to factory-created instance)
 */
export async function searchExternalBooksWithThreshold(
  title: string,
  author: string | null,
  threshold: number = 0.9,
  bookDataClient?: IBookDataClient
): Promise<EnrichedBook[]> {
  try {
    // Build query for book API
    let query = `intitle:${title}`;
    if (author) {
      query += `+inauthor:${author}`;
    }

    const client = bookDataClient || createBookDataClient();
    const results = await client.searchBooks(query);
    const matches: EnrichedBook[] = [];

    for (const result of results) {
      const titleSimilarity = calculateSimilarity(title, result.title);

      // Title must meet threshold
      if (titleSimilarity < threshold) {
        continue;
      }

      // If we have authors, BOTH must meet threshold independently
      if (author && result.author) {
        const authorSimilarity = calculateSimilarity(author, result.author);
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
          source: "external",
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
          source: "external",
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
    console.error("[Book Enrichment] Error searching external book API:", error);
    return [];
  }
}

/**
 * Enrich extracted book information with local DB and external book API
 * Process primary book + alternatives (up to 3 total)
 * Priority: Local DB first, only try external API if NO local matches found
 * @param prismaClient - Optional Prisma client for testing (defaults to global instance)
 * @param bookDataClient - Optional book data client for testing (defaults to factory-created instance)
 */
export async function enrichBookInfo(
  extractedInfo: ExtractedBookInfo,
  prismaClient?: PrismaClient,
  bookDataClient?: IBookDataClient
): Promise<EnrichmentResult> {
  // Create client once if not provided to preserve rate limiting state across all API calls
  const client = bookDataClient || createBookDataClient();

  // Collect all books to enrich (primary + alternatives, max 3 total)
  const booksToEnrich: Array<{ title: string; author: string | null }> = [
    { title: extractedInfo.title, author: extractedInfo.author },
  ];

  console.log(
    `[Book Enrichment] Enriching ${booksToEnrich.length} book(s)`
  );

  // Step 1: Search local DB for all books and track which books were found
  const localMatches: EnrichedBook[] = [];
  const booksFoundLocally = new Set<string>();

  for (const book of booksToEnrich) {
    const matches = await searchLocalBooks(book.title, book.author, 0.9, prismaClient);
    if (matches.length > 0) {
      localMatches.push(...matches);
      booksFoundLocally.add(`${book.title}|||${book.author}`); // Track found books
    }
  }

  console.log(
    `[Book Enrichment] Local DB: found ${localMatches.length} matches for ${booksFoundLocally.size}/${booksToEnrich.length} books`
  );

  // Step 2: Search external book API ONLY for books NOT found locally
  const externalMatches: EnrichedBook[] = [];
  const booksToSearchExternal = booksToEnrich.filter(
    (book) => !booksFoundLocally.has(`${book.title}|||${book.author}`)
  );

  if (booksToSearchExternal.length > 0) {
    console.log(
      `[Book Enrichment] Searching external book API for ${booksToSearchExternal.length} books not found locally`
    );
    for (const book of booksToSearchExternal) {
      const matches = await searchExternalBooksWithThreshold(book.title, book.author, 0.9, client);
      externalMatches.push(...matches);
    }
  }

  console.log(`[Book Enrichment] External API: found ${externalMatches.length} matches`);

  // Step 3: Combine results from both sources
  const allMatches: EnrichedBook[] = [...localMatches, ...externalMatches];

  if (allMatches.length === 0) {
    console.log("[Book Enrichment] No matches found anywhere");
    return {
      source: "none",
      matches: [],
    };
  }

  // Determine source based on what we found
  const source =
    localMatches.length > 0 && externalMatches.length > 0
      ? "local" // If we have both, prefer showing "local" as primary source
      : localMatches.length > 0
      ? "local"
      : "external";

  // Remove duplicates by normalized title+author and limit to 3
  // This ensures we don't show multiple editions of the same book
  const uniqueMatches: EnrichedBook[] = [];
  const seenBooks = new Set<string>();

  for (const match of allMatches) {
    // Create a normalized key from title and author for deduplication
    const normalizedTitle = normalizeString(match.title);
    const normalizedAuthor = match.author ? normalizeString(match.author) : "no-author";
    const bookKey = `${normalizedTitle}|||${normalizedAuthor}`;

    if (!seenBooks.has(bookKey)) {
      seenBooks.add(bookKey);
      uniqueMatches.push(match);
      if (uniqueMatches.length >= 3) break; // Limit to 3
    }
  }

  console.log(
    `[Book Enrichment] Returning ${uniqueMatches.length} unique matches (source: ${source})`
  );

  return {
    source,
    matches: uniqueMatches,
  };
}
