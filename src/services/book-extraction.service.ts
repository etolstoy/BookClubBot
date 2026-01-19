import { createLLMClient } from "../clients/llm/factory.js";
import type { ExtractedBookInfo } from "../lib/interfaces/index.js";

/**
 * Extract book information from review text using LLM
 * @param reviewText - The review text to extract from
 * @param commandParams - Optional command parameters (e.g., "Title – Author" from /review command)
 * @returns ExtractedBookInfo or null if extraction fails
 */
export async function extractBookInfo(
  reviewText: string,
  commandParams?: string
): Promise<ExtractedBookInfo | null> {
  const client = createLLMClient();
  return client.extractBookInfo(reviewText, commandParams);
}

/**
 * Extract book information from review text using LLM
 * @deprecated Use extractBookInfo() instead. Kept for backward compatibility.
 * @param reviewText - The review text to extract from
 * @param commandParams - Optional command parameters (e.g., "Title – Author" from /review command)
 * @returns ExtractedBookInfo or null if extraction fails
 */
export async function extractBookInfoGPT4o(
  reviewText: string,
  commandParams?: string
): Promise<ExtractedBookInfo | null> {
  return extractBookInfo(reviewText, commandParams);
}
