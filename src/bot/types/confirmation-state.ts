/**
 * Type definitions for book confirmation flow state machine
 */

import type { ExtractedBookInfo } from "../../lib/interfaces/index.js";

// Re-export ExtractedBookInfo for backward compatibility
export type { ExtractedBookInfo };

/**
 * Enriched book data from local DB or Google Books with similarity score
 */
export interface EnrichedBook {
  id?: number; // Present if from local DB
  title: string;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  googleBooksId?: string | null;
  source: "local" | "google";
  similarity: {
    title: number;
    author: number;
  };
}

/**
 * Result of enrichment process (local DB + Google Books search)
 */
export interface EnrichmentResult {
  source: "local" | "google" | "none";
  matches: EnrichedBook[];
}

/**
 * Review data captured from Telegram message
 */
export interface ReviewData {
  telegramUserId: bigint;
  telegramUsername?: string | null;
  telegramDisplayName?: string | null;
  reviewText: string;
  messageId: bigint;
  chatId: bigint | null;
  reviewedAt: Date;
}

/**
 * State machine states for book confirmation flow
 */
export type ConfirmationFlowState =
  | "showing_options"
  | "awaiting_isbn"
  | "awaiting_title"
  | "awaiting_author";

/**
 * Temporary data stored during multi-step flows
 */
export interface TempData {
  enteredTitle?: string;
  enteredAuthor?: string;
  enteredIsbn?: string;
}

/**
 * Complete state for a book confirmation session
 */
export interface BookConfirmationState {
  reviewData: ReviewData;
  extractedInfo: ExtractedBookInfo | null;
  enrichmentResults: EnrichmentResult | null;
  state: ConfirmationFlowState;
  statusMessageId: number;
  tempData: TempData;
  createdAt: Date;
}
