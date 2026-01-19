import { config } from "../lib/config.js";
import { cleanISBN } from "../lib/isbn-utils.js";
import { sendWarningNotification } from "./notification.service.js";
import type { BookSearchResult } from "../lib/interfaces/index.js";

// Rate limiting configuration (configurable via environment)
const GOOGLE_BOOKS_DELAY_MS = parseInt(process.env.GOOGLE_BOOKS_DELAY_MS || '200'); // Delay between requests
const MAX_RETRIES = parseInt(process.env.GOOGLE_BOOKS_MAX_RETRIES || '3');
const INITIAL_BACKOFF_MS = parseInt(process.env.GOOGLE_BOOKS_BACKOFF_MS || '1000'); // Start with 1 second

// Track last request time for rate limiting
let lastRequestTime = 0;

/**
 * Wait to respect rate limiting
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < GOOGLE_BOOKS_DELAY_MS) {
    const waitTime = GOOGLE_BOOKS_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Fetch with retry logic and exponential backoff for 429 errors
 */
async function fetchWithRetry(url: string, retryCount = 0): Promise<Response> {
  await waitForRateLimit();

  const response = await fetch(url);

  if (response.status === 429) {
    if (retryCount >= MAX_RETRIES) {
      const errorMessage = `Rate limit exceeded after ${MAX_RETRIES} retries`;
      console.error(`[Google Books] ${errorMessage}`);

      // Send notification to admin chat
      await sendWarningNotification(
        'Google Books API rate limit exceeded',
        {
          operation: 'Google Books API request',
          additionalInfo: `Failed after ${MAX_RETRIES} retry attempts. Consider increasing delay or reducing request frequency.`
        }
      ).catch(err => {
        console.error('[Google Books] Failed to send rate limit notification:', err);
      });

      throw new Error(errorMessage);
    }

    // Exponential backoff: 1s, 2s, 4s
    const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
    console.log(`[Google Books] Rate limit hit (429). Retrying in ${backoffTime}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);

    await new Promise(resolve => setTimeout(resolve, backoffTime));
    return fetchWithRetry(url, retryCount + 1);
  }

  return response;
}

// Re-export BookSearchResult for backward compatibility
export type { BookSearchResult };

export interface GoogleBookResult {
  id: string;
  title: string;
  authors: string[];
  description?: string;
  categories?: string[];
  publishedDate?: string;
  pageCount?: number;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  infoLink?: string;
}

function extractYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function extractISBN(
  identifiers?: Array<{ type: string; identifier: string }>
): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((id) => id.type === "ISBN_13");
  if (isbn13) return isbn13.identifier;
  const isbn10 = identifiers.find((id) => id.type === "ISBN_10");
  return isbn10?.identifier ?? null;
}

function getBestCoverUrl(
  imageLinks?: GoogleBookResult["imageLinks"]
): string | null {
  if (!imageLinks) return null;
  // Prefer higher quality images
  return (
    imageLinks.large ||
    imageLinks.medium ||
    imageLinks.small ||
    imageLinks.thumbnail ||
    imageLinks.smallThumbnail ||
    null
  );
}


export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: "10",
    printType: "books",
  });

  if (config.googleBooksApiKey) {
    params.set("key", config.googleBooksApiKey);
  }

  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;

  try {
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { items?: Array<{ id: string; volumeInfo: GoogleBookResult }> };

    if (!data.items || data.items.length === 0) {
      return [];
    }

    return data.items.map(
      (item: { id: string; volumeInfo: GoogleBookResult }): BookSearchResult => {
        const info = item.volumeInfo;
        const title = info.title || "Unknown Title";
        const author = info.authors?.join(", ") ?? null;
        const isbn = extractISBN(info.industryIdentifiers);

        return {
          googleBooksId: item.id,
          title,
          author,
          description: info.description ?? null,
          genres: info.categories ?? [],
          publicationYear: extractYear(info.publishedDate),
          coverUrl: getBestCoverUrl(info.imageLinks),
          isbn,
          pageCount: info.pageCount ?? null,
        };
      }
    );
  } catch (error) {
    console.error("Error searching Google Books:", error);
    return [];
  }
}

export async function getBookById(
  volumeId: string
): Promise<BookSearchResult | null> {
  const params = new URLSearchParams();

  if (config.googleBooksApiKey) {
    params.set("key", config.googleBooksApiKey);
  }

  const url = `https://www.googleapis.com/books/v1/volumes/${volumeId}?${params}`;

  try {
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return null;
    }

    const item = await response.json() as { id: string; volumeInfo: GoogleBookResult };
    const info = item.volumeInfo;
    const title = info.title || "Unknown Title";
    const author = info.authors?.join(", ") ?? null;
    const isbn = extractISBN(info.industryIdentifiers);

    return {
      googleBooksId: item.id,
      title,
      author,
      description: info.description ?? null,
      genres: info.categories ?? [],
      publicationYear: extractYear(info.publishedDate),
      coverUrl: getBestCoverUrl(info.imageLinks),
      isbn,
      pageCount: info.pageCount ?? null,
    };
  } catch (error) {
    console.error("Error fetching book by ID:", error);
    return null;
  }
}

export async function searchBookByTitleAndAuthor(
  title: string,
  author?: string
): Promise<BookSearchResult | null> {
  let query = `intitle:${title}`;
  if (author) {
    query += `+inauthor:${author}`;
  }

  const results = await searchBooks(query);
  return results[0] ?? null;
}

/**
 * Search with cascading fallbacks to handle variations and typos
 */
export async function searchBookWithFallbacks(
  title: string,
  author?: string,
  titleVariants?: string[],
  authorVariants?: string[]
): Promise<BookSearchResult | null> {
  try {
    // Try 1: Exact match with primary title and author
    if (author) {
      let result = await searchBookByTitleAndAuthor(title, author);
      if (result) {
        console.log('[Google Books] Found with exact match (title + author)');
        return result;
      }
    }

    // Try 2: Primary title only (handles author typos)
    let result = await searchBookByTitleAndAuthor(title);
    if (result) {
      console.log('[Google Books] Found with primary title only');
      return result;
    }

    // Try 3: Title variants with author
    if (titleVariants && titleVariants.length > 0 && author) {
      for (const variant of titleVariants) {
        result = await searchBookByTitleAndAuthor(variant, author);
        if (result) {
          console.log(`[Google Books] Found with title variant: "${variant}"`);
          return result;
        }
      }
    }

    // Try 4: Title variants without author
    if (titleVariants && titleVariants.length > 0) {
      for (const variant of titleVariants) {
        result = await searchBookByTitleAndAuthor(variant);
        if (result) {
          console.log(`[Google Books] Found with title variant (no author): "${variant}"`);
          return result;
        }
      }
    }

    // Try 5: Primary title with author variants
    if (authorVariants && authorVariants.length > 0) {
      for (const authorVariant of authorVariants) {
        result = await searchBookByTitleAndAuthor(title, authorVariant);
        if (result) {
          console.log(`[Google Books] Found with author variant: "${authorVariant}"`);
          return result;
        }
      }
    }

    // Try 6: Fuzzy search (general query, less precise)
    const fuzzyQuery = `${title} ${author || ''}`.trim();
    const fuzzyResults = await searchBooks(fuzzyQuery);
    if (fuzzyResults.length > 0) {
      console.log('[Google Books] Found with fuzzy search');
      return fuzzyResults[0];
    }

    console.log('[Google Books] No results found after all fallbacks');
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
      console.error('[Google Books] Rate limit exceeded during cascading search. Stopping fallbacks.');
      throw error; // Propagate to caller
    }
    console.error('[Google Books] Error during cascading search:', error);
    return null;
  }
}

/**
 * Search book by ISBN (most precise)
 */
export async function searchBookByISBN(isbn: string): Promise<BookSearchResult | null> {
  const query = `isbn:${cleanISBN(isbn)}`;
  const results = await searchBooks(query);

  if (results.length > 0) {
    console.log(`[Google Books] Found book by ISBN: ${isbn}`);
    return results[0];
  }

  console.log(`[Google Books] No book found for ISBN: ${isbn}`);
  return null;
}
