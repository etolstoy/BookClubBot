import { createLLMClient } from "../clients/llm/factory.js";
import type { Sentiment, ILLMClient } from "../lib/interfaces/index.js";

// Re-export Sentiment for backward compatibility
export type { Sentiment };

/**
 * Analyze sentiment of review text using LLM
 * @param reviewText - The review text to analyze
 * @param llmClient - Optional LLM client for testing (defaults to factory-created instance)
 * @returns Sentiment classification or null if analysis fails
 */
export async function analyzeSentiment(
  reviewText: string,
  llmClient?: ILLMClient
): Promise<Sentiment | null> {
  const client = llmClient || createLLMClient();
  return client.analyzeSentiment(reviewText);
}
