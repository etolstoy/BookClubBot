import { createLLMClient } from "../clients/llm/factory.js";
import type { ExtractedBookInfo, ILLMClient } from "../lib/interfaces/index.js";

/**
 * Extract book information from review text using LLM
 * @param reviewText - The review text to extract from
 * @param commandParams - Optional command parameters (e.g., "Title – Author" from /review command)
 * @param llmClient - Optional LLM client for testing (defaults to factory-created instance)
 * @returns ExtractedBookInfo or null if extraction fails
 */
export async function extractBookInfo(
  reviewText: string,
  commandParams?: string,
  llmClient?: ILLMClient
): Promise<ExtractedBookInfo | null> {
  const client = llmClient || createLLMClient();
  return client.extractBookInfo(reviewText, commandParams);
}
