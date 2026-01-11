/**
 * Generate a Goodreads URL for a book
 * Prefers ISBN-based URL if available, falls back to search query
 */
export function generateGoodreadsUrl(
  isbn: string | null | undefined,
  title: string,
  author: string | null | undefined
): string {
  if (isbn) {
    // Clean ISBN (remove hyphens and spaces)
    const cleanIsbn = isbn.replace(/[-\s]/g, "");
    return `https://www.goodreads.com/book/isbn/${cleanIsbn}`;
  }

  // Build search query
  const query = author ? `${title} ${author}` : title;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.goodreads.com/search?q=${encodedQuery}`;
}
