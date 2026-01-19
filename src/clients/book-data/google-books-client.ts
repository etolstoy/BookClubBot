/**
 * Google Books Client Implementation
 * Real implementation of IBookDataClient using Google Books API
 */

import { cleanISBN } from "../../lib/isbn-utils.js";
import type {
  IBookDataClient,
  BookDataClientConfig,
  BookSearchResult,
  BookSearchOptions,
} from "../../lib/interfaces/index.js";

/**
 * Raw Google Books API result structure
 */
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

/**
 * Google Books implementation of IBookDataClient
 * Handles book metadata searches with rate limiting and retry logic
 */
export class GoogleBooksClient implements IBookDataClient {
  private config: BookDataClientConfig;
  private lastRequestTime: number = 0;

  constructor(config: BookDataClientConfig) {
    this.config = {
      rateLimitDelayMs: 200,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Search for books by query string
   */
  async searchBooks(
    query: string,
    maxResults: number = 10
  ): Promise<BookSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      maxResults: maxResults.toString(),
      printType: "books",
    });

    if (this.config.apiKey) {
      params.set("key", this.config.apiKey);
    }

    const url = `https://www.googleapis.com/books/v1/volumes?${params}`;

    try {
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        console.error(
          `[Google Books Client] API error: ${response.status}`
        );
        return [];
      }

      const data = (await response.json()) as {
        items?: Array<{ id: string; volumeInfo: GoogleBookResult }>;
      };

      if (!data.items || data.items.length === 0) {
        return [];
      }

      return data.items.map(
        (item: {
          id: string;
          volumeInfo: GoogleBookResult;
        }): BookSearchResult => {
          const info = item.volumeInfo;
          const title = info.title || "Unknown Title";
          const author = info.authors?.join(", ") ?? null;
          const isbn = this.extractISBN(info.industryIdentifiers);

          return {
            googleBooksId: item.id,
            title,
            author,
            description: info.description ?? null,
            genres: info.categories ?? [],
            publicationYear: this.extractYear(info.publishedDate),
            coverUrl: this.getBestCoverUrl(info.imageLinks),
            isbn,
            pageCount: info.pageCount ?? null,
          };
        }
      );
    } catch (error) {
      console.error("[Google Books Client] Error searching books:", error);
      return [];
    }
  }

  /**
   * Get book by Google Books volume ID
   */
  async getBookById(id: string): Promise<BookSearchResult | null> {
    const params = new URLSearchParams();

    if (this.config.apiKey) {
      params.set("key", this.config.apiKey);
    }

    const url = `https://www.googleapis.com/books/v1/volumes/${id}?${params}`;

    try {
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        console.error(
          `[Google Books Client] API error: ${response.status}`
        );
        return null;
      }

      const item = (await response.json()) as {
        id: string;
        volumeInfo: GoogleBookResult;
      };
      const info = item.volumeInfo;
      const title = info.title || "Unknown Title";
      const author = info.authors?.join(", ") ?? null;
      const isbn = this.extractISBN(info.industryIdentifiers);

      return {
        googleBooksId: item.id,
        title,
        author,
        description: info.description ?? null,
        genres: info.categories ?? [],
        publicationYear: this.extractYear(info.publishedDate),
        coverUrl: this.getBestCoverUrl(info.imageLinks),
        isbn,
        pageCount: info.pageCount ?? null,
      };
    } catch (error) {
      console.error(
        "[Google Books Client] Error fetching book by ID:",
        error
      );
      return null;
    }
  }

  /**
   * Search book by title and author
   */
  async searchBookByTitleAndAuthor(
    title: string,
    author?: string
  ): Promise<BookSearchResult | null> {
    let query = `intitle:${title}`;
    if (author) {
      query += `+inauthor:${author}`;
    }

    const results = await this.searchBooks(query);
    return results[0] ?? null;
  }

  /**
   * Search with cascading fallbacks (6 strategies)
   */
  async searchBookWithFallbacks(
    options: BookSearchOptions
  ): Promise<BookSearchResult | null> {
    const { title, author, titleVariants, authorVariants } = options;

    try {
      // Try 1: Exact match with primary title and author
      if (author) {
        let result = await this.searchBookByTitleAndAuthor(title, author);
        if (result) {
          console.log(
            "[Google Books Client] Found with exact match (title + author)"
          );
          return result;
        }
      }

      // Try 2: Primary title only (handles author typos)
      let result = await this.searchBookByTitleAndAuthor(title);
      if (result) {
        console.log("[Google Books Client] Found with primary title only");
        return result;
      }

      // Try 3: Title variants with author
      if (titleVariants && titleVariants.length > 0 && author) {
        for (const variant of titleVariants) {
          result = await this.searchBookByTitleAndAuthor(variant, author);
          if (result) {
            console.log(
              `[Google Books Client] Found with title variant: "${variant}"`
            );
            return result;
          }
        }
      }

      // Try 4: Title variants without author
      if (titleVariants && titleVariants.length > 0) {
        for (const variant of titleVariants) {
          result = await this.searchBookByTitleAndAuthor(variant);
          if (result) {
            console.log(
              `[Google Books Client] Found with title variant (no author): "${variant}"`
            );
            return result;
          }
        }
      }

      // Try 5: Primary title with author variants
      if (authorVariants && authorVariants.length > 0) {
        for (const authorVariant of authorVariants) {
          result = await this.searchBookByTitleAndAuthor(title, authorVariant);
          if (result) {
            console.log(
              `[Google Books Client] Found with author variant: "${authorVariant}"`
            );
            return result;
          }
        }
      }

      // Try 6: Fuzzy search (general query, less precise)
      const fuzzyQuery = `${title} ${author || ""}`.trim();
      const fuzzyResults = await this.searchBooks(fuzzyQuery);
      if (fuzzyResults.length > 0) {
        console.log("[Google Books Client] Found with fuzzy search");
        return fuzzyResults[0];
      }

      console.log(
        "[Google Books Client] No results found after all fallbacks"
      );
      return null;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Rate limit exceeded")
      ) {
        console.error(
          "[Google Books Client] Rate limit exceeded during cascading search. Stopping fallbacks."
        );
        throw error; // Propagate to caller
      }
      console.error(
        "[Google Books Client] Error during cascading search:",
        error
      );
      return null;
    }
  }

  /**
   * Search book by ISBN (most precise)
   */
  async searchBookByISBN(isbn: string): Promise<BookSearchResult | null> {
    const query = `isbn:${cleanISBN(isbn)}`;
    const results = await this.searchBooks(query);

    if (results.length > 0) {
      console.log(`[Google Books Client] Found book by ISBN: ${isbn}`);
      return results[0];
    }

    console.log(`[Google Books Client] No book found for ISBN: ${isbn}`);
    return null;
  }

  /**
   * Wait to respect rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.config.rateLimitDelayMs!) {
      const waitTime = this.config.rateLimitDelayMs! - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch with retry logic and exponential backoff for 429 errors
   */
  private async fetchWithRetry(
    url: string,
    retryCount: number = 0
  ): Promise<Response> {
    await this.waitForRateLimit();

    const response = await fetch(url);

    if (response.status === 429) {
      if (retryCount >= this.config.maxRetries!) {
        const errorMessage = `Rate limit exceeded after ${this.config.maxRetries} retries`;
        console.error(`[Google Books Client] ${errorMessage}`);

        // Send notification via callback
        if (this.config.onRateLimit) {
          await this.config.onRateLimit(new Error(errorMessage)).catch(
            (err) => {
              console.error(
                "[Google Books Client] Failed to send rate limit notification:",
                err
              );
            }
          );
        }

        throw new Error(errorMessage);
      }

      // Exponential backoff: 1s, 2s, 4s
      const backoffTime = 1000 * Math.pow(2, retryCount);
      console.log(
        `[Google Books Client] Rate limit hit (429). Retrying in ${backoffTime}ms... (attempt ${
          retryCount + 1
        }/${this.config.maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, backoffTime));
      return this.fetchWithRetry(url, retryCount + 1);
    }

    return response;
  }

  /**
   * Extract year from publication date string
   */
  private extractYear(dateStr?: string): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract ISBN from industry identifiers (prefer ISBN-13)
   */
  private extractISBN(
    identifiers?: Array<{ type: string; identifier: string }>
  ): string | null {
    if (!identifiers) return null;
    const isbn13 = identifiers.find((id) => id.type === "ISBN_13");
    if (isbn13) return isbn13.identifier;
    const isbn10 = identifiers.find((id) => id.type === "ISBN_10");
    return isbn10?.identifier ?? null;
  }

  /**
   * Get best available cover image URL
   */
  private getBestCoverUrl(
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
}
