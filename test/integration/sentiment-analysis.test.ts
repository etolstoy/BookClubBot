/**
 * Integration Tests: Sentiment Analysis Service
 * Tests sentiment analysis with mock LLM client
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import type { Sentiment } from "../../src/lib/interfaces/index.js";
import {
  loadReviewFixture,
  type ReviewFixture,
} from "../fixtures/helpers/fixture-loader.js";
import { assertSentimentMatches } from "../helpers/assertions.js";

describe("Sentiment Analysis Integration", () => {
  let mockClient: MockLLMClient;

  beforeEach(() => {
    mockClient = new MockLLMClient();
  });

  describe("Positive sentiment", () => {
    it("should detect positive sentiment", async () => {
      const fixture = loadReviewFixture("positive-gatsby");

      mockClient.mockResponse(fixture.reviewText, {
        sentiment: fixture.expectedSentiment,
      });

      const result = await mockClient.analyzeSentiment(fixture.reviewText);

      assertSentimentMatches(result, fixture.expectedSentiment);
      expect(result).toBe("positive");
    });

    it("should handle positive reviews with Cyrillic text", async () => {
      const fixture = loadReviewFixture("cyrillic-war-and-peace");

      mockClient.mockResponse(fixture.reviewText, {
        sentiment: fixture.expectedSentiment,
      });

      const result = await mockClient.analyzeSentiment(fixture.reviewText);

      assertSentimentMatches(result, fixture.expectedSentiment);
      expect(result).toBe("positive");
    });
  });

  describe("Negative sentiment", () => {
    it("should detect negative sentiment", async () => {
      const fixture = loadReviewFixture("negative-1984");

      mockClient.mockResponse(fixture.reviewText, {
        sentiment: fixture.expectedSentiment,
      });

      const result = await mockClient.analyzeSentiment(fixture.reviewText);

      assertSentimentMatches(result, fixture.expectedSentiment);
      expect(result).toBe("negative");
    });
  });

  describe("Neutral sentiment", () => {
    it("should detect neutral sentiment", async () => {
      const fixture = loadReviewFixture("multiple-books");

      mockClient.mockResponse(fixture.reviewText, {
        sentiment: fixture.expectedSentiment,
      });

      const result = await mockClient.analyzeSentiment(fixture.reviewText);

      assertSentimentMatches(result, fixture.expectedSentiment);
      expect(result).toBe("neutral");
    });
  });

  describe("API failures", () => {
    it("should return null on API failure", async () => {
      mockClient.setBehavior("api_error");

      const result = await mockClient.analyzeSentiment("Some review text");

      expect(result).toBeNull();
    });

    it("should return null on rate limit error", async () => {
      mockClient.setBehavior("rate_limit");

      const result = await mockClient.analyzeSentiment("Some review text");

      expect(result).toBeNull();
    });
  });

  describe("Empty/short text", () => {
    it("should handle empty review text", async () => {
      mockClient.setBehavior("success");

      const result = await mockClient.analyzeSentiment("");

      // Even with empty text, mock returns default behavior
      expect(result).toBe("positive");
    });

    it("should handle very short review text", async () => {
      const reviewText = "Good!";

      mockClient.mockResponse(reviewText, {
        sentiment: "positive",
      });

      const result = await mockClient.analyzeSentiment(reviewText);

      expect(result).toBe("positive");
    });
  });

  describe("Call logging", () => {
    it("should log sentiment analysis calls", async () => {
      mockClient.setBehavior("success");

      await mockClient.analyzeSentiment("Review 1");
      await mockClient.analyzeSentiment("Review 2");
      await mockClient.analyzeSentiment("Review 3");

      expect(mockClient.getCallCount("analyzeSentiment")).toBe(3);
    });

    it("should track call arguments", async () => {
      mockClient.setBehavior("success");

      const reviewText = "This is a test review";
      await mockClient.analyzeSentiment(reviewText);

      const calls = mockClient.getMethodCalls("analyzeSentiment");
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe(reviewText);
      expect(calls[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe("Mixed mock responses", () => {
    it("should handle different sentiments for different reviews", async () => {
      const review1 = "Amazing book!";
      const review2 = "Terrible waste of time.";
      const review3 = "It was okay, nothing special.";

      mockClient.mockResponse(review1, { sentiment: "positive" });
      mockClient.mockResponse(review2, { sentiment: "negative" });
      mockClient.mockResponse(review3, { sentiment: "neutral" });

      const result1 = await mockClient.analyzeSentiment(review1);
      const result2 = await mockClient.analyzeSentiment(review2);
      const result3 = await mockClient.analyzeSentiment(review3);

      expect(result1).toBe("positive");
      expect(result2).toBe("negative");
      expect(result3).toBe("neutral");
      expect(mockClient.getCallCount("analyzeSentiment")).toBe(3);
    });
  });
});
