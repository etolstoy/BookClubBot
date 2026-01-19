import { createLLMClient } from "../clients/llm/factory.js";
import type { ExtractedBookInfo } from "../lib/interfaces/index.js";

/**
 * Extract book information using GPT-4o
 * Now uses OpenAIClient internally for better abstraction
 * @param reviewText - The review text to extract from
 * @param commandParams - Optional command parameters (e.g., "Title – Author" from /review command)
 * @returns ExtractedBookInfo or null if extraction fails
 */
export async function extractBookInfoGPT4o(
  reviewText: string,
  commandParams?: string
): Promise<ExtractedBookInfo | null> {
  const client = createLLMClient();
  return client.extractBookInfo(reviewText, commandParams);
}
