/**
 * Integration Tests: Book Extraction Service
 * Tests book extraction with mock LLM client
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import type { ExtractedBookInfo } from "../../src/lib/interfaces/index.js";
import {
  loadReviewFixture,
  loadAllReviewFixtures,
} from "../fixtures/helpers/fixture-loader.js";
import { assertBookInfoMatches } from "../helpers/assertions.js";

describe("Book Extraction Integration", () => {
  let mockClient: MockLLMClient;

  beforeEach(() => {
    mockClient = new MockLLMClient();
  });

  describe("Single book extraction", () => {
    it("should extract single book with high confidence", async () => {
      const fixture = loadReviewFixture("positive-gatsby");

      mockClient.mockResponse(fixture.reviewText, {
        extractedInfo: fixture.expectedExtraction,
      });

      const result = await mockClient.extractBookInfo(fixture.reviewText);

      assertBookInfoMatches(result, fixture.expectedExtraction);
      expect(result!.confidence).toBe("high");
    });

    it("should extract single book with low confidence", async () => {
      const reviewText =
        "Read an interesting book recently but can't quite recall the title.";

      const expectedInfo: ExtractedBookInfo = {
        title: "Uncertain Book",
        author: null,
        confidence: "low",
      };

      mockClient.setBehavior("low_confidence");
      const result = await mockClient.extractBookInfo(reviewText);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBe("low");
    });
  });

  describe("Command parameters extraction", () => {
    it("should extract from command parameters", async () => {
      const commandParams = "The Great Gatsby — F. Scott Fitzgerald";
      const reviewText = "This book was amazing!";

      const expectedInfo: ExtractedBookInfo = {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        confidence: "high",
      };

      mockClient.mockResponse(reviewText, {
        extractedInfo: expectedInfo,
      });

      const result = await mockClient.extractBookInfo(reviewText, commandParams);

      assertBookInfoMatches(result, expectedInfo);
    });
  });

  describe("No books found", () => {
    it("should return null when no books found", async () => {
      const reviewText = "Just had lunch, it was delicious!";

      mockClient.setBehavior("no_book_found");
      const result = await mockClient.extractBookInfo(reviewText);

      expect(result).toBeNull();
    });
  });

  describe("API errors", () => {
    it("should handle rate limit error", async () => {
      mockClient.setBehavior("rate_limit");

      await expect(
        mockClient.extractBookInfo("Some review text")
      ).rejects.toThrow("429");
    });

    it("should handle API error", async () => {
      mockClient.setBehavior("api_error");

      await expect(
        mockClient.extractBookInfo("Some review text")
      ).rejects.toThrow("OpenAI API error");
    });

    it("should handle invalid JSON response", async () => {
      mockClient.setBehavior("invalid_response");

      await expect(
        mockClient.extractBookInfo("Some review text")
      ).rejects.toThrow("Invalid JSON response");
    });
  });

  describe("Cyrillic text extraction", () => {
    it("should extract from Cyrillic text", async () => {
      const fixture = loadReviewFixture("cyrillic-war-and-peace");

      mockClient.mockResponse(fixture.reviewText, {
        extractedInfo: fixture.expectedExtraction,
      });

      const result = await mockClient.extractBookInfo(fixture.reviewText);

      assertBookInfoMatches(result, fixture.expectedExtraction);
      expect(result!.title).toBe("Война и мир");
      expect(result!.author).toBe("Лев Толстой");
    });
  });

  describe("Special characters", () => {
    it("should handle quotes and special characters", async () => {
      const reviewText = 'Read "The Great Gatsby" — loved it!';

      const expectedInfo: ExtractedBookInfo = {
        title: "The Great Gatsby",
        author: null,
        confidence: "high",
      };

      mockClient.mockResponse(reviewText, {
        extractedInfo: expectedInfo,
      });

      const result = await mockClient.extractBookInfo(reviewText);

      assertBookInfoMatches(result, expectedInfo);
    });
  });

  describe("Call logging", () => {
    it("should log method calls", async () => {
      mockClient.setBehavior("success");

      await mockClient.extractBookInfo("Test review 1");
      await mockClient.extractBookInfo("Test review 2");

      expect(mockClient.getCallCount("extractBookInfo")).toBe(2);
      expect(mockClient.callLog).toHaveLength(2);
    });

    it("should track call arguments", async () => {
      mockClient.setBehavior("success");

      const reviewText = "Test review";
      const commandParams = "Test Book — Test Author";

      await mockClient.extractBookInfo(reviewText, commandParams);

      const calls = mockClient.getMethodCalls("extractBookInfo");
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe(reviewText);
      expect(calls[0].args[1]).toBe(commandParams);
    });
  });
});
