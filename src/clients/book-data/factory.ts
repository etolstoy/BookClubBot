/**
 * Book Data Client Factory
 * Creates configured book data client instances with notification callbacks
 */

import { GoogleBooksClient } from "./google-books-client.js";
import { config } from "../../lib/config.js";
import { sendWarningNotification } from "../../services/notification.service.js";
import type { IBookDataClient } from "../../lib/interfaces/index.js";

/**
 * Create and configure a book data client (Google Books)
 * Includes rate limit notification handler
 * @returns Configured IBookDataClient instance
 */
export function createBookDataClient(): IBookDataClient {
  const rateLimitDelayMs = parseInt(
    process.env.GOOGLE_BOOKS_DELAY_MS || "200"
  );
  const maxRetries = parseInt(process.env.GOOGLE_BOOKS_MAX_RETRIES || "3");

  return new GoogleBooksClient({
    apiKey: config.googleBooksApiKey,
    rateLimitDelayMs,
    maxRetries,
    onRateLimit: async (error: Error) => {
      await sendWarningNotification("Google Books API rate limit exceeded", {
        operation: "Google Books API request",
        additionalInfo: `Failed after ${maxRetries} retry attempts. Consider increasing delay or reducing request frequency.`,
      });
    },
  });
}
