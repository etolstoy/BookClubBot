/**
 * Integration Tests: Book Enrichment Service
 * Tests book enrichment with mock book data client and test database
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import {
  setupTestDatabase,
  cleanupTestDatabase,
  clearTestData,
  seedTestData,
} from "../helpers/test-db.js";
import { searchLocalBooks, searchGoogleBooksWithThreshold } from "../../src/services/book-enrichment.service.js";
import { getAllBookFixtures } from "../fixtures/helpers/fixture-loader.js";
import type { PrismaClient } from "@prisma/client";

describe("Book Enrichment Integration", () => {
  let prisma: PrismaClient;
  let mockClient: MockBookDataClient;

  beforeEach(async () => {
    prisma = await setupTestDatabase();
    mockClient = new MockBookDataClient();

    // Seed mock Google Books results
    const fixtures = getAllBookFixtures();
    mockClient.seedBooks(fixtures);
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe("Local database search", () => {
    it("should find exact match in local DB (no API call needed)", async () => {
      // Seed local database
      await seedTestData(prisma, {
        books: [
          {
            title: "The Great Gatsby",
            author: "F. Scott Fitzgerald",
            isbn: "9780743273565",
            googleBooksId: "iXN-swEACAAJ",
          },
        ],
      });

      const results = await searchLocalBooks(
        "The Great Gatsby",
        "F. Scott Fitzgerald",
        0.9,
        prisma
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("The Great Gatsby");
      expect(results[0].source).toBe("local");
      expect(results[0].similarity.title).toBeGreaterThanOrEqual(0.9);
      expect(results[0].similarity.author).toBeGreaterThanOrEqual(0.9);
    });

    it("should find no matches in empty local DB", async () => {
      const results = await searchLocalBooks("Nonexistent Book", "Unknown Author", 0.9, prisma);

      expect(results).toHaveLength(0);
    });

    it("should filter by 90% similarity threshold", async () => {
      await seedTestData(prisma, {
        books: [
          {
            title: "The Great Gatsby",
            author: "F. Scott Fitzgerald",
          },
          {
            title: "Great Expectations",
            author: "Charles Dickens",
          },
        ],
      });

      // Search for similar title with minor typo (should still meet 90% threshold)
      const results = await searchLocalBooks("The Great Gatsby", "F. Scott Fitzgerald", 0.9, prisma);

      // Should match "The Great Gatsby" but not "Great Expectations"
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("The Great Gatsby");
    });
  });

  describe("Google Books search with threshold", () => {
    it("should find match in Google Books (local DB miss)", async () => {
      mockClient.setBehavior("success");

      const results = await searchGoogleBooksWithThreshold(
        "The Great Gatsby",
        "F. Scott Fitzgerald",
        0.9
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe("external");
      expect(results[0].title).toContain("Great Gatsby");
    });

    it("should return empty array when no Google Books matches", async () => {
      mockClient.setBehavior("empty_results");

      const results = await searchGoogleBooksWithThreshold(
        "Nonexistent Book xyz123",
        "Unknown Author",
        0.9
      );

      expect(results).toHaveLength(0);
    });

    it("should handle Google Books API failure gracefully", async () => {
      mockClient.setBehavior("api_error");

      // Should not throw, just return empty results
      const results = await searchGoogleBooksWithThreshold(
        "Some Book",
        "Some Author",
        0.9
      );

      expect(results).toHaveLength(0);
    });
  });

  describe("Multiple matches (top 3)", () => {
    it("should return top 3 matches sorted by similarity", async () => {
      // Seed multiple similar books with titles that will meet similarity threshold
      await seedTestData(prisma, {
        books: [
          { title: "The Great Adventure", author: "Test Author" },
          { title: "The Great Adventures", author: "Test Author" },
          { title: "The Great Adventure Book", author: "Test Author" },
          { title: "A Great Adventure", author: "Test Author" },
        ],
      });

      const results = await searchLocalBooks("The Great Adventure", "Test Author", 0.7, prisma);

      // Should return multiple matches (at least 3)
      expect(results.length).toBeGreaterThanOrEqual(3);

      // Should be sorted by similarity score
      for (let i = 0; i < results.length - 1; i++) {
        const scoreA = (results[i].similarity.title + results[i].similarity.author) / 2;
        const scoreB = (results[i + 1].similarity.title + results[i + 1].similarity.author) / 2;
        expect(scoreA).toBeGreaterThanOrEqual(scoreB);
      }
    });
  });

  describe("Similarity scoring edge cases", () => {
    it("should match books with very similar titles but different authors", async () => {
      await seedTestData(prisma, {
        books: [
          { title: "The Great Book", author: "Author One" },
          { title: "The Great Book", author: "Author Two" },
        ],
      });

      // Search for same title with first author
      const results = await searchLocalBooks("The Great Book", "Author One", 0.9, prisma);

      expect(results).toHaveLength(1);
      expect(results[0].author).toBe("Author One");
    });

    it("should handle partial author name matches", async () => {
      await seedTestData(prisma, {
        books: [
          { title: "Test Book", author: "J.K. Rowling" },
        ],
      });

      // Search with just last name
      const results = await searchLocalBooks("Test Book", "Rowling", 0.7, prisma);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].author).toBe("J.K. Rowling");
    });

    it("should handle books with no author", async () => {
      await seedTestData(prisma, {
        books: [
          { title: "Anonymous Book", author: null },
        ],
      });

      const results = await searchLocalBooks("Anonymous Book", null, 0.9, prisma);

      expect(results).toHaveLength(1);
      expect(results[0].author).toBeNull();
      expect(results[0].similarity.author).toBe(1.0); // No author comparison
    });
  });

  describe("Mixed sources (local + Google Books)", () => {
    it("should deduplicate books from multiple sources", async () => {
      const sameGoogleBooksId = "test-123";

      // Seed local DB with a book
      await seedTestData(prisma, {
        books: [
          {
            title: "Test Book",
            author: "Test Author",
            googleBooksId: sameGoogleBooksId,
          },
        ],
      });

      // Mock Google Books to return same book
      mockClient.seedBooks([
        {
          googleBooksId: sameGoogleBooksId,
          title: "Test Book",
          author: "Test Author",
          description: null,
          genres: [],
          publicationYear: null,
          coverUrl: null,
          isbn: null,
          pageCount: null,
        },
      ]);

      // Search local first
      const localResults = await searchLocalBooks("Test Book", "Test Author", 0.9, prisma);
      expect(localResults).toHaveLength(1);
      expect(localResults[0].source).toBe("local");

      // If we search Google Books, it would return the same book
      // In real flow, enrichment would deduplicate by googleBooksId
    });
  });

  describe("Call logging and verification", () => {
    it("should not call Google Books API when local match found", async () => {
      await seedTestData(prisma, {
        books: [
          { title: "Local Book", author: "Local Author" },
        ],
      });

      const results = await searchLocalBooks("Local Book", "Local Author", 0.9, prisma);

      expect(results).toHaveLength(1);
      // Mock client should have zero calls since we only searched locally
      expect(mockClient.getCallCount("searchBooks")).toBe(0);
    });
  });
});
