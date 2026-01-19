/**
 * ISBN utility functions for validation, cleaning, and detection
 */

// Comprehensive ISBN regex that validates ISBN-10 and ISBN-13 formats
// Supports various formats: with/without hyphens, with/without spaces, with/without "ISBN" prefix
const ISBN_REGEX =
  /^(?:ISBN(?:-1[03])?:? )?(?=[0-9X]{10}$|(?=(?:[0-9]+[- ]){3})[- 0-9X]{13}$|97[89][0-9]{10}$|(?=(?:[0-9]+[- ]){4})[- 0-9]{17}$)(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]$/;

/**
 * Validates if a string is a valid ISBN-10 or ISBN-13
 * Accepts various formats: hyphenated, with spaces, with "ISBN" prefix
 * @param isbn - The ISBN string to validate
 * @returns True if valid ISBN format
 * @example
 * isValidISBN("978-0-7475-3269-9") // true
 * isValidISBN("ISBN-13: 978-0-7475-3269-9") // true
 * isValidISBN("0-7475-3269-X") // true (ISBN-10 with check digit)
 * isValidISBN("invalid") // false
 */
export function isValidISBN(isbn: string): boolean {
  return ISBN_REGEX.test(isbn);
}

/**
 * Removes hyphens and spaces from ISBN
 * @param isbn - The ISBN string to clean
 * @returns Cleaned ISBN with only alphanumeric characters
 * @example
 * cleanISBN("978-0-7475-3269-9") // "9780747532699"
 * cleanISBN("978 0 7475 3269 9") // "9780747532699"
 */
export function cleanISBN(isbn: string): string {
  return isbn.replace(/[-\s]/g, "");
}

/**
 * Detects if a query string is an ISBN and returns it cleaned
 * Uses simple length-based detection (10 or 13 digits)
 * @param query - The search query to check
 * @returns Cleaned ISBN if detected, null otherwise
 * @example
 * detectISBN("978-0-7475-3269-9") // "9780747532699"
 * detectISBN("War and Peace") // null
 * detectISBN("0747532699") // "0747532699"
 */
export function detectISBN(query: string): string | null {
  // Remove hyphens and spaces
  const cleaned = query.replace(/[-\s]/g, "");

  // Check for ISBN-10 (10 digits) or ISBN-13 (13 digits)
  const isbn10Pattern = /^\d{10}$/;
  const isbn13Pattern = /^\d{13}$/;

  if (isbn10Pattern.test(cleaned) || isbn13Pattern.test(cleaned)) {
    return cleaned;
  }

  return null;
}
