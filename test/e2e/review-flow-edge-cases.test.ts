import { describe, it, expect, beforeEach } from "vitest";
import { extractBookInfo } from "../../src/services/book-extraction.service.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";

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
    const reviewText = `
      This year I read three amazing books: "1984" by George Orwell,
      "Brave New World" by Aldous Huxley, and "Fahrenheit 451" by Ray Bradbury.
      But "1984" left the biggest impression on me. Orwell's vision is terrifying.
      #рецензия
    `;

    // Mock: LLM identifies primary book and alternatives
    mockLLMClient.mockResponse(reviewText, {
      extractedInfo: {
        title: "1984",
        author: "George Orwell",
        confidence: "high",
        alternativeBooks: [
          { title: "Brave New World", author: "Aldous Huxley" },
          { title: "Fahrenheit 451", author: "Ray Bradbury" },
        ],
      },
    });

    // Act: Extract book info from text mentioning multiple books
    const result = await extractBookInfo(reviewText, undefined, mockLLMClient);

    // Assert: Primary book was identified
    expect(result).not.toBeNull();
    expect(result?.title).toBe("1984");
    expect(result?.author).toBe("George Orwell");

    // Assert: Alternative books were captured
    expect(result?.alternativeBooks).toBeDefined();
    expect(result?.alternativeBooks?.length).toBe(2);
    expect(result?.alternativeBooks?.[0].title).toBe("Brave New World");
    expect(result?.alternativeBooks?.[1].title).toBe("Fahrenheit 451");

    // Assert: Confidence is high for primary book
    expect(result?.confidence).toBe("high");
  });
});
