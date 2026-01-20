/**
 * Central export point for all client interfaces
 */

// LLM Client Interface
export type {
  ILLMClient,
  LLMClientConfig,
  ExtractedBookInfo,
  Sentiment,
  LLMConfidence,
  LLMCompletionOptions,
} from "./llm-client.interface.js";

// Book Data Client Interface
export type {
  IBookDataClient,
  BookDataClientConfig,
  BookSearchResult,
  BookSearchOptions,
} from "./book-data-client.interface.js";
