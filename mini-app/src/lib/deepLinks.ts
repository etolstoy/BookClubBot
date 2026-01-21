/**
 * Deep link utilities for sharing books and reviews
 */

/**
 * Generate Telegram deep link for book page
 * @param botUsername - Bot username (without @ prefix)
 * @param bookId - Database book ID
 * @returns Deep link to book page in Mini App
 */
export function getBookDeepLink(botUsername: string, bookId: number): string {
  return `https://t.me/${botUsername}?startapp=book_${bookId}`;
}

/**
 * Generate Telegram deep link for review page
 * @param botUsername - Bot username (without @ prefix)
 * @param reviewId - Database review ID
 * @returns Deep link to review page in Mini App
 */
export function getReviewDeepLink(botUsername: string, reviewId: number): string {
  return `https://t.me/${botUsername}?startapp=review_${reviewId}`;
}

/**
 * Copy text to clipboard using Clipboard API
 * @param text - Text to copy
 * @throws Error if clipboard API is not available
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error('Clipboard API not available');
  }
  await navigator.clipboard.writeText(text);
}

/**
 * Trigger Telegram haptic feedback (light impact)
 * Safe to call even if Telegram WebApp is not available
 */
export function showHapticFeedback(): void {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
}
