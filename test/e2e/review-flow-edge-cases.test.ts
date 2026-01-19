import { describe, it, expect, beforeEach } from "vitest";
import { extractBookInfo } from "../../src/services/book-extraction.service.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";

/**
 * E2E Tests: Edge Cases
 * Tests unusual but real-world scenarios: Cyrillic text, mixed languages,
 * very long text, special characters, multiple books
 */

describe("E2E: Edge Cases", () => {
  let mockLLMClient: MockLLMClient;

  beforeEach(() => {
    mockLLMClient = new MockLLMClient();
  });

  it("Test 1: Review with only Cyrillic characters (Russian text)", async () => {
    const reviewText = "Прочитал «Война и мир» Льва Толстого. Шедевр! #рецензия";

    // Mock: LLM extracts Cyrillic book info correctly
    mockLLMClient.mockResponse(reviewText, {
      extractedInfo: {
        title: "Война и мир",
        author: "Лев Толстой",
        confidence: "high",
      },
    });

    // Act: Extract book info from Cyrillic text
    const result = await extractBookInfo(reviewText, undefined, mockLLMClient);

    // Assert: Extraction succeeded with Cyrillic characters
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Война и мир");
    expect(result?.author).toBe("Лев Толстой");
    expect(result?.confidence).toBe("high");

    // Assert: LLM was called correctly
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);
  });

  it("Test 2: Review with mixed languages (English + Russian)", async () => {
    const reviewText = 'Just finished reading "Мастер и Маргарита" by Mikhail Bulgakov. Absolutely brilliant! #рецензия';

    // Mock: LLM handles mixed language text
    mockLLMClient.mockResponse(reviewText, {
      extractedInfo: {
        title: "Мастер и Маргарита",
        author: "Mikhail Bulgakov",
        confidence: "high",
      },
    });

    // Act: Extract book info from mixed language text
    const result = await extractBookInfo(reviewText, undefined, mockLLMClient);

    // Assert: Extraction succeeded with mixed languages
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Мастер и Маргарита");
    expect(result?.author).toBe("Mikhail Bulgakov");
    expect(result?.confidence).toBe("high");

    // Assert: System handles both Cyrillic title and Latin author name
    expect(result?.title).toMatch(/[А-Яа-я]/); // Contains Cyrillic
    expect(result?.author).toMatch(/[A-Za-z]/); // Contains Latin
  });

  it("Test 3: Very long review text (>1000 chars)", async () => {
    // Create a very long review (simulating detailed book analysis)
    const longReview =
      "Just finished «The Brothers Karamazov» by Fyodor Dostoevsky. " +
      "This masterpiece explores profound themes of faith, doubt, morality, and free will. ".repeat(20) +
      "#рецензия";

    expect(longReview.length).toBeGreaterThan(1000);

    // Mock: LLM handles long text
    mockLLMClient.mockResponse(longReview, {
      extractedInfo: {
        title: "The Brothers Karamazov",
        author: "Fyodor Dostoevsky",
        confidence: "high",
      },
    });

    // Act: Extract book info from very long text
    const result = await extractBookInfo(longReview, undefined, mockLLMClient);

    // Assert: Extraction succeeded despite length
    expect(result).not.toBeNull();
    expect(result?.title).toBe("The Brothers Karamazov");
    expect(result?.author).toBe("Fyodor Dostoevsky");

    // Assert: LLM was called with full text
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);
  });

  it("Test 4: Special characters in book title/author (quotes, em-dashes)", async () => {
    // Test with various special characters: quotes, em-dashes, hyphens, apostrophes
    const reviewText = 'Reading "Harry Potter and the Philosopher\'s Stone" by J.K. Rowling — absolutely magical! #рецензия';

    // Mock: LLM handles special characters correctly
    mockLLMClient.mockResponse(reviewText, {
      extractedInfo: {
        title: "Harry Potter and the Philosopher's Stone",
        author: "J.K. Rowling",
        confidence: "high",
      },
    });

    // Act: Extract book info with special characters
    const result = await extractBookInfo(reviewText, undefined, mockLLMClient);

    // Assert: Extraction succeeded with special characters
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Harry Potter and the Philosopher's Stone");
    expect(result?.author).toBe("J.K. Rowling");

    // Assert: Special characters preserved
    expect(result?.title).toContain("'"); // Apostrophe
    expect(result?.author).toContain("."); // Periods in initials
  });

  it("Test 5: Multiple books mentioned → primary book selected", async () => {
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
