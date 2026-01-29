/**
 * Mock Book Data Client for testing
 * Provides configurable book database and behaviors
 */

import type {
  IBookDataClient,
  BookSearchResult,
  BookSearchOptions,
} from "../../lib/interfaces/index.js";

/**
 * Pre-defined behavior modes for the mock client
 */
export type MockBookDataBehavior =
  | "success"
  | "not_found"
  | "rate_limit"
  | "api_error"
  | "empty_results";

/**
 * Call log entry for tracking method invocations
 */
export interface CallLogEntry {
  method: string;
  args: unknown[];
  timestamp: Date;
}

/**
 * Mock implementation of IBookDataClient for testing
 * Supports seeding books and call logging
 */
export class MockBookDataClient implements IBookDataClient {
  private books: Map<string, BookSearchResult> = new Map();
  private defaultBehavior: MockBookDataBehavior = "success";
  public callLog: CallLogEntry[] = [];

  constructor(behavior: MockBookDataBehavior = "success") {
    this.defaultBehavior = behavior;
  }

  /**
   * Seed mock books for testing
   * Books are indexed by: googleBooksId, isbn:{isbn}, title:{title}
   * @param books - Array of books to seed
   */
  seedBooks(books: BookSearchResult[]): void {
    books.forEach((book) => {
      // Index by Google Books ID
      this.books.set(book.googleBooksId, book);

      // Index by ISBN if available
      if (book.isbn) {
        this.books.set(`isbn:${book.isbn}`, book);
      }

      // Index by title (case-insensitive)
      this.books.set(`title:${book.title.toLowerCase()}`, book);

      // Index by title + author (case-insensitive)
      if (book.author) {
        const key = `${book.title}:${book.author}`.toLowerCase();
        this.books.set(key, book);
      }
    });
  }

  /**
   * Configure behavior mode
   * @param behavior - The behavior mode to use
   */
  setBehavior(behavior: MockBookDataBehavior): void {
    this.defaultBehavior = behavior;
  }

  /**
   * Search for books by query string (mock implementation)
   */
  async searchBooks(
    query: string,
    maxResults = 10
  ): Promise<BookSearchResult[]> {
    this.callLog.push({
      method: "searchBooks",
      args: [query, maxResults],
      timestamp: new Date(),
    });

    if (this.defaultBehavior === "rate_limit") {
      throw new Error("429: Rate limit exceeded");
    }

    if (this.defaultBehavior === "api_error") {
      throw new Error("Google Books API error");
    }

    if (
      this.defaultBehavior === "empty_results" ||
      this.defaultBehavior === "not_found"
    ) {
      return [];
    }

    // Filter books by query (supports Google Books format: intitle:... +inauthor:...)
    const results = Array.from(this.books.values())
      .filter((book) => {
        // Parse Google Books query format
        const queryLower = query.toLowerCase();
        let titleQuery = "";
        let authorQuery = "";

        // Extract intitle: part
        const titleMatch = queryLower.match(/intitle:([^+]+)/);
        if (titleMatch) {
          titleQuery = titleMatch[1].trim();
        }

        // Extract inauthor: part
        const authorMatch = queryLower.match(/inauthor:(.+)/);
        if (authorMatch) {
          authorQuery = authorMatch[1].trim();
        }

        // If no special format, fallback to simple search
        if (!titleQuery && !authorQuery) {
          const searchText =
            `${book.title} ${book.author || ""}`.toLowerCase();
          return searchText.includes(queryLower);
        }

        // Match title if specified
        if (titleQuery && !book.title.toLowerCase().includes(titleQuery)) {
          return false;
        }

        // Match author if specified
        if (authorQuery && book.author && !book.author.toLowerCase().includes(authorQuery)) {
          return false;
        }

        return true;
      })
      // Deduplicate by googleBooksId
      .filter(
        (book, index, self) =>
          index ===
          self.findIndex((b) => b.googleBooksId === book.googleBooksId)
      );

    return results.slice(0, maxResults);
  }

  /**
   * Get book by unique identifier (mock implementation)
   */
  async getBookById(id: string): Promise<BookSearchResult | null> {
    this.callLog.push({
      method: "getBookById",
      args: [id],
      timestamp: new Date(),
    });

    if (this.defaultBehavior === "rate_limit") {
      throw new Error("429: Rate limit exceeded");
    }

    if (this.defaultBehavior === "api_error") {
      throw new Error("Google Books API error");
    }

    if (this.defaultBehavior === "not_found") {
      return null;
    }

    return this.books.get(id) || null;
  }

  /**
   * Search book by title and author (mock implementation)
   */
  async searchBookByTitleAndAuthor(
    title: string,
    author?: string
  ): Promise<BookSearchResult | null> {
    this.callLog.push({
      method: "searchBookByTitleAndAuthor",
      args: [title, author],
      timestamp: new Date(),
    });

    if (this.defaultBehavior === "rate_limit") {
      throw new Error("429: Rate limit exceeded");
    }

    if (this.defaultBehavior === "api_error") {
      throw new Error("Google Books API error");
    }

    if (this.defaultBehavior === "not_found") {
      return null;
    }

    // Try title + author combination first
    if (author) {
      const key = `${title}:${author}`.toLowerCase();
      const result = this.books.get(key);
      if (result) return result;
    }

    // Fall back to title only
    const titleKey = `title:${title.toLowerCase()}`;
    return this.books.get(titleKey) || null;
  }

  /**
   * Search book with cascading fallbacks (mock implementation)
   */
  async searchBookWithFallbacks(
    options: BookSearchOptions
  ): Promise<BookSearchResult | null> {
    this.callLog.push({
      method: "searchBookWithFallbacks",
      args: [options],
      timestamp: new Date(),
    });

    if (this.defaultBehavior === "rate_limit") {
      throw new Error("429: Rate limit exceeded");
    }

    if (this.defaultBehavior === "api_error") {
      throw new Error("Google Books API error");
    }

    if (this.defaultBehavior === "not_found") {
      return null;
    }

    // Try primary title + author
    let result = await this.searchBookByTitleAndAuthor(
      options.title,
      options.author
    );
    if (result) return result;

    // Try title variants with author
    if (options.titleVariants && options.author) {
      for (const variant of options.titleVariants) {
        result = await this.searchBookByTitleAndAuthor(variant, options.author);
        if (result) return result;
      }
    }

    // Try title variants without author
    if (options.titleVariants) {
      for (const variant of options.titleVariants) {
        result = await this.searchBookByTitleAndAuthor(variant);
        if (result) return result;
      }
    }

    // Try author variants with primary title
    if (options.authorVariants) {
      for (const authorVariant of options.authorVariants) {
        result = await this.searchBookByTitleAndAuthor(
          options.title,
          authorVariant
        );
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Search book by ISBN (mock implementation)
   */
  async searchBookByISBN(isbn: string): Promise<BookSearchResult | null> {
    this.callLog.push({
      method: "searchBookByISBN",
      args: [isbn],
      timestamp: new Date(),
    });

    if (this.defaultBehavior === "rate_limit") {
      throw new Error("429: Rate limit exceeded");
    }

    if (this.defaultBehavior === "api_error") {
      throw new Error("Google Books API error");
    }

    if (this.defaultBehavior === "not_found") {
      return null;
    }

    return this.books.get(`isbn:${isbn}`) || null;
  }

  /**
   * Clear call log (useful between tests)
   */
  clearCallLog(): void {
    this.callLog = [];
  }

  /**
   * Get number of times a method was called
   * @param method - The method name to count
   */
  getCallCount(method: string): number {
    return this.callLog.filter((log) => log.method === method).length;
  }

  /**
   * Get all calls to a specific method
   * @param method - The method name to filter by
   */
  getMethodCalls(method: string): CallLogEntry[] {
    return this.callLog.filter((log) => log.method === method);
  }

  /**
   * Reset all mock state (books, call log, behavior)
   */
  reset(): void {
    this.books.clear();
    this.callLog = [];
    this.defaultBehavior = "success";
  }

  /**
   * Get all seeded books (useful for debugging tests)
   */
  getAllBooks(): BookSearchResult[] {
    const uniqueBooks = new Map<string, BookSearchResult>();
    for (const book of this.books.values()) {
      uniqueBooks.set(book.googleBooksId, book);
    }
    return Array.from(uniqueBooks.values());
  }
}
