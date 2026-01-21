/**
 * URL utilities for external book services (Google Books, Goodreads)
 */

/**
 * Generate Google Books URL from Google Books ID
 * @param googleBooksId - The Google Books ID
 * @returns Google Books URL or null if no ID provided
 */
export function getGoogleBooksUrl(googleBooksId: string | null): string | null {
  return googleBooksId
    ? `https://books.google.com/books?id=${googleBooksId}`
    : null;
}

/**
 * Generate Goodreads URL (prefers ISBN-based URL, falls back to search)
 * @param isbn - The book's ISBN (will be cleaned of hyphens)
 * @param title - The book title
 * @param author - The book author (optional)
 * @returns Goodreads URL or null if title is empty
 */
export function generateGoodreadsUrl(
  isbn: string | null,
  title: string,
  author: string | null
): string | null {
  // Prefer ISBN-based URL (most reliable)
  if (isbn) {
    const cleanIsbn = isbn.replace(/-/g, "");
    return `https://www.goodreads.com/book/isbn/${cleanIsbn}`;
  }

  // Fallback to search URL
  const query = author ? `${title} ${author}` : title;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.goodreads.com/search?q=${encodedQuery}`;
}

/**
 * Generate Telegram deep link with startapp parameter
 * @param botUsername - Bot username from @BotFather (without @ prefix)
 * @param startParam - Parameter passed to Mini App (e.g., "book_123")
 * @returns Telegram deep link (https://t.me/botusername?startapp=book_123)
 */
export function getTelegramDeepLink(
  botUsername: string,
  startParam: string
): string {
  return `https://t.me/${botUsername}?startapp=${startParam}`;
}

/**
 * Generate deep link to Mini App book page
 * @param botUsername - Bot username
 * @param bookId - Database book ID
 * @returns Deep link to book page
 */
export function getBookDeepLink(
  botUsername: string,
  bookId: number
): string {
  return getTelegramDeepLink(botUsername, `book_${bookId}`);
}
