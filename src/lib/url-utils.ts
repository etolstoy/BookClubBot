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
