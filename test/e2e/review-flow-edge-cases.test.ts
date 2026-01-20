import { describe, it, expect, beforeEach } from "vitest";
import { extractBookInfo } from "../../src/services/book-extraction.service.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { loadReviewFixture } from "../fixtures/helpers/fixture-loader.js";

/**
 * E2E Tests: Edge Cases
 * Tests unusual but real-world scenarios with multiple books mentioned
 */

describe("E2E: Edge Cases", () => {
  let mockLLMClient: MockLLMClient;

  beforeEach(() => {
    mockLLMClient = new MockLLMClient();
  });

  it("Multiple books mentioned → primary book selected", async () => {
    const fixture = loadReviewFixture("multiple-books");

    // Mock: LLM identifies primary book and alternatives
    mockLLMClient.mockResponse(fixture.reviewText, {
      extractedInfo: fixture.expectedExtraction,
    });

    // Act: Extract book info from text mentioning multiple books
    const result = await extractBookInfo(fixture.reviewText, undefined, mockLLMClient);

    // Assert: Primary book was identified
    expect(result).not.toBeNull();
    expect(result?.title).toBe(fixture.expectedExtraction.title);
    expect(result?.author).toBe(fixture.expectedExtraction.author);
    expect(result?.confidence).toBe(fixture.expectedExtraction.confidence);

    // Assert: Alternative books were captured
    expect(result?.alternativeBooks).toBeDefined();
    expect(result?.alternativeBooks?.length).toBe(fixture.expectedExtraction.alternativeBooks?.length);

    if (fixture.expectedExtraction.alternativeBooks && result?.alternativeBooks) {
      fixture.expectedExtraction.alternativeBooks.forEach((expectedBook, index) => {
        expect(result.alternativeBooks?.[index].title).toBe(expectedBook.title);
        expect(result.alternativeBooks?.[index].author).toBe(expectedBook.author);
      });
    }
  });
});
