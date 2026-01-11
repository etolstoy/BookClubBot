/**
 * Validate ISBN format (10 or 13 digits)
 * Returns cleaned ISBN if valid, null otherwise
 */
export function validateISBN(input: string): string | null {
  const cleaned = input.replace(/[-\s]/g, "");
  const isbn10Pattern = /^\d{10}$/;
  const isbn13Pattern = /^\d{13}$/;

  if (isbn10Pattern.test(cleaned) || isbn13Pattern.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Sanitize user input (trim and lowercase)
 */
export function sanitizeInput(input: string): string {
  return input.trim().toLowerCase();
}
