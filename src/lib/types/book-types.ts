/**
 * Shared book-related types used across services
 */

import type { LLMConfidence } from "../interfaces/index.js";

/**
 * Book information extracted from review text by LLM
 */
export interface ExtractedBookInfo {
  title: string;
  author: string | null;
  confidence: LLMConfidence;
}

/**
 * Enriched book data from local DB or external API
 */
export interface EnrichedBook {
  id?: number; // Only present for local DB books
  title: string;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  googleBooksId: string | null;
  source: "local" | "external";
  similarity: {
    title: number;
    author: number;
  };
}

/**
 * Result of book enrichment process
 */
export interface EnrichmentResult {
  source: "local" | "external" | "none";
  matches: EnrichedBook[];
}
