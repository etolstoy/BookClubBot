/**
 * LLM Client Interface
 * Abstracts Language Model operations for book extraction and sentiment analysis
 */

/**
 * Confidence level for book extraction results
 */
export type LLMConfidence = "high" | "medium" | "low";

/**
 * Book information extracted from review text
 */
export interface ExtractedBookInfo {
  title: string;
  author: string | null;
  confidence: LLMConfidence;
}

/**
 * Sentiment classification for review text
 */
export type Sentiment = "positive" | "negative" | "neutral";

/**
 * Classification of whether one Telegram review message contains one review
 * or clearly separated independent reviews.
 */
export interface ReviewStructureClassification {
  kind: "single" | "concatenated";
  parts: string[];
  partStartMarkers?: string[];
}

/**
 * Options for generic LLM completion requests
 */
export interface LLMCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Configuration for LLM client initialization
 */
export interface LLMClientConfig {
  apiKey: string;
  defaultModel?: string;
  defaultTemperature?: number;
  onRateLimit?: (error: Error) => Promise<void>;
  onError?: (error: Error, operation: string) => Promise<void>;
}

/**
 * Interface for Language Model operations
 * Implementations: OpenAI, Claude, or mock for testing
 */
export interface ILLMClient {
  /**
   * Extract book information from review text
   * @param reviewText - The review text to analyze
   * @param commandParams - Optional command parameters (e.g., "Title — Author" from /review command)
   * @returns Extracted book info or null if extraction fails
   */
  extractBookInfo(
    reviewText: string,
    commandParams?: string
  ): Promise<ExtractedBookInfo | null>;

  /**
   * Analyze sentiment of review text
   * @param reviewText - The review text to analyze
   * @returns Sentiment classification or null if analysis fails
   */
  analyzeSentiment(reviewText: string): Promise<Sentiment | null>;

  /**
   * Classify whether a review message should be processed as one review or
   * split into clearly separated independent review texts.
   * @param reviewText - The original Telegram review text
   * @returns Classification with exact original substrings as parts
   */
  classifyReviewStructure(
    reviewText: string
  ): Promise<ReviewStructureClassification | null>;

  /**
   * Generic completion method for custom prompts (for future extensibility)
   * @param options - Completion options
   * @returns Response text or null if fails
   */
  complete(options: LLMCompletionOptions): Promise<string | null>;
}
