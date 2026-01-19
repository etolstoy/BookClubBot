/**
 * Mock LLM Client for testing
 * Provides configurable behaviors and call logging
 */

import type {
  ILLMClient,
  ExtractedBookInfo,
  Sentiment,
  LLMCompletionOptions,
} from "../../lib/interfaces/index.js";

/**
 * Pre-defined behavior modes for the mock client
 */
export type MockLLMBehavior =
  | "success"
  | "no_book_found"
  | "rate_limit"
  | "api_error"
  | "invalid_response"
  | "multiple_books"
  | "low_confidence";

/**
 * Mock response configuration for specific inputs
 */
export interface MockLLMResponse {
  extractedInfo?: ExtractedBookInfo | null;
  sentiment?: Sentiment | null;
  completionText?: string | null;
  shouldThrow?: boolean;
  error?: Error;
}

/**
 * Call log entry for tracking method invocations
 */
export interface CallLogEntry {
  method: string;
  args: unknown[];
  timestamp: Date;
}

/**
 * Mock implementation of ILLMClient for testing
 * Supports configurable behaviors and call logging
 */
export class MockLLMClient implements ILLMClient {
  private responses: Map<string, MockLLMResponse> = new Map();
  private defaultBehavior: MockLLMBehavior = "success";
  public callLog: CallLogEntry[] = [];

  constructor(behavior: MockLLMBehavior = "success") {
    this.defaultBehavior = behavior;
  }

  /**
   * Configure mock response for specific input
   * @param reviewText - The review text to match
   * @param response - The response to return
   */
  mockResponse(reviewText: string, response: MockLLMResponse): void {
    this.responses.set(reviewText, response);
  }

  /**
   * Configure behavior mode (affects all calls without specific mock responses)
   * @param behavior - The behavior mode to use
   */
  setBehavior(behavior: MockLLMBehavior): void {
    this.defaultBehavior = behavior;
  }

  /**
   * Extract book information from review text (mock implementation)
   */
  async extractBookInfo(
    reviewText: string,
    commandParams?: string
  ): Promise<ExtractedBookInfo | null> {
    this.callLog.push({
      method: "extractBookInfo",
      args: [reviewText, commandParams],
      timestamp: new Date(),
    });

    // Check for specific mock response
    const mockResponse = this.responses.get(reviewText);
    if (mockResponse) {
      if (mockResponse.shouldThrow) {
        throw mockResponse.error || new Error("Mock error");
      }
      return mockResponse.extractedInfo ?? null;
    }

    // Default behavior based on mode
    return this.getDefaultExtractedInfo(this.defaultBehavior);
  }

  /**
   * Analyze sentiment of review text (mock implementation)
   */
  async analyzeSentiment(reviewText: string): Promise<Sentiment | null> {
    this.callLog.push({
      method: "analyzeSentiment",
      args: [reviewText],
      timestamp: new Date(),
    });

    const mockResponse = this.responses.get(reviewText);
    if (mockResponse) {
      if (mockResponse.shouldThrow) {
        throw mockResponse.error || new Error("Mock error");
      }
      return mockResponse.sentiment ?? "neutral";
    }

    return this.getDefaultSentiment(this.defaultBehavior);
  }

  /**
   * Generic completion (mock implementation)
   */
  async complete(options: LLMCompletionOptions): Promise<string | null> {
    this.callLog.push({
      method: "complete",
      args: [options],
      timestamp: new Date(),
    });

    const mockResponse = this.responses.get(options.userPrompt);
    if (mockResponse) {
      if (mockResponse.shouldThrow) {
        throw mockResponse.error || new Error("Mock error");
      }
      return mockResponse.completionText ?? "Mock completion response";
    }

    return "Mock completion response";
  }

  /**
   * Clear call log (useful between tests)
   */
  clearCallLog(): void {
    this.callLog = [];
  }

  /**
   * Get number of times a method was called
   * @param method - The method name to count
   */
  getCallCount(method: string): number {
    return this.callLog.filter((log) => log.method === method).length;
  }

  /**
   * Get all calls to a specific method
   * @param method - The method name to filter by
   */
  getMethodCalls(method: string): CallLogEntry[] {
    return this.callLog.filter((log) => log.method === method);
  }

  /**
   * Reset all mock state (responses, call log, behavior)
   */
  reset(): void {
    this.responses.clear();
    this.callLog = [];
    this.defaultBehavior = "success";
  }

  /**
   * Get default extracted book info based on behavior mode
   */
  private getDefaultExtractedInfo(
    behavior: MockLLMBehavior
  ): ExtractedBookInfo | null {
    switch (behavior) {
      case "success":
        return {
          title: "Mock Book Title",
          author: "Mock Author",
          confidence: "high",
          alternativeBooks: [],
        };

      case "multiple_books":
        return {
          title: "Primary Book",
          author: "Primary Author",
          confidence: "medium",
          alternativeBooks: [
            { title: "Alternative Book 1", author: "Alt Author 1" },
            { title: "Alternative Book 2", author: "Alt Author 2" },
          ],
        };

      case "low_confidence":
        return {
          title: "Uncertain Book",
          author: "Uncertain Author",
          confidence: "low",
          alternativeBooks: [],
        };

      case "no_book_found":
        return null;

      case "rate_limit":
        throw new Error("429: Rate limit exceeded");

      case "api_error":
        throw new Error("OpenAI API error");

      case "invalid_response":
        throw new Error("Invalid JSON response");

      default:
        return null;
    }
  }

  /**
   * Get default sentiment based on behavior mode
   */
  private getDefaultSentiment(behavior: MockLLMBehavior): Sentiment | null {
    switch (behavior) {
      case "success":
        return "positive";

      case "api_error":
      case "rate_limit":
        return null;

      default:
        return "neutral";
    }
  }
}
