import { createLLMClient } from "../clients/llm/factory.js";
import type { Sentiment } from "../lib/interfaces/index.js";

// Re-export Sentiment for backward compatibility
export type { Sentiment };

/**
 * Analyze sentiment of review text
 * Now uses OpenAIClient internally for better abstraction
 * @param reviewText - The review text to analyze
 * @returns Sentiment classification or null if analysis fails
 */
export async function analyzeSentiment(
  reviewText: string
): Promise<Sentiment | null> {
  const client = createLLMClient();
  return client.analyzeSentiment(reviewText);
}
