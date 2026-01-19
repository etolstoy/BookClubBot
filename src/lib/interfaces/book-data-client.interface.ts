/**
 * Book Data Client Interface
 * Abstracts book metadata operations (Google Books, Open Library, etc.)
 */

/**
 * Normalized book search result
 */
export interface BookSearchResult {
  googleBooksId: string;
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  publicationYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  pageCount: number | null;
}

/**
 * Options for advanced book search with variants
 */
export interface BookSearchOptions {
  title: string;
  author?: string;
  titleVariants?: string[];
  authorVariants?: string[];
  maxResults?: number;
}

/**
 * Configuration for book data client initialization
 */
export interface BookDataClientConfig {
  apiKey?: string;
  rateLimitDelayMs?: number;
  maxRetries?: number;
  onRateLimit?: (error: Error) => Promise<void>;
  onError?: (error: Error, operation: string) => Promise<void>;
}

/**
 * Interface for book metadata operations
 * Implementations: Google Books, Open Library, or mock for testing
 */
export interface IBookDataClient {
  /**
   * Search for books by query string
   * @param query - Search query (supports intitle:, inauthor:, isbn: syntax)
   * @param maxResults - Maximum number of results (default: 10)
   * @returns Array of book results
   */
  searchBooks(query: string, maxResults?: number): Promise<BookSearchResult[]>;

  /**
   * Get book by unique identifier
   * @param id - Book identifier (Google Books volume ID, ISBN, etc.)
   * @returns Book result or null if not found
   */
  getBookById(id: string): Promise<BookSearchResult | null>;

  /**
   * Search book by title and author
   * @param title - Book title
   * @param author - Book author (optional)
   * @returns First matching book or null
   */
  searchBookByTitleAndAuthor(
    title: string,
    author?: string
  ): Promise<BookSearchResult | null>;

  /**
   * Search book with cascading fallbacks (handles variants and typos)
   * Uses multiple strategies to find the best match
   * @param options - Search options with variants
   * @returns First matching book or null
   */
  searchBookWithFallbacks(
    options: BookSearchOptions
  ): Promise<BookSearchResult | null>;

  /**
   * Search book by ISBN
   * @param isbn - ISBN identifier (ISBN-10 or ISBN-13)
   * @returns Book result or null if not found
   */
  searchBookByISBN(isbn: string): Promise<BookSearchResult | null>;
}
