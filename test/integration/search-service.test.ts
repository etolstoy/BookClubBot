import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../src/lib/prisma.js";
import { clearTestData } from "../helpers/test-db.js";
import {
  searchBooks,
  searchAuthors,
  searchUsers,
  searchReviews,
  searchAll,
  search,
} from "../../src/services/search.service.js";

describe.sequential("Search Service", () => {
  beforeEach(async () => {
    await clearTestData(prisma);

    // Seed test data
    const book1 = await prisma.book.create({
      data: {
        title: "Война и мир",
        author: "Лев Толстой",
        googleBooksId: "war-peace-1",
      },
    });

    const book2 = await prisma.book.create({
      data: {
        title: "Анна Каренина",
        author: "Лев Толстой",
        googleBooksId: "anna-k-1",
      },
    });

    const book3 = await prisma.book.create({
      data: {
        title: "Преступление и наказание",
        author: "Федор Достоевский",
        googleBooksId: "crime-1",
      },
    });

    // Create reviews with different users
    await prisma.review.create({
      data: {
        bookId: book1.id,
        telegramUserId: BigInt(12345),
        telegramUsername: "ivan_petrov",
        telegramDisplayName: "Иван Петров",
        reviewText: "Замечательная книга о русской истории и аристократии",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-01"),
      },
    });

    await prisma.review.create({
      data: {
        bookId: book2.id,
        telegramUserId: BigInt(12345),
        telegramUsername: "ivan_petrov",
        telegramDisplayName: "Иван Петров",
        reviewText: "Трагическая история любви и общества",
        sentiment: "neutral",
        reviewedAt: new Date("2024-01-02"),
      },
    });

    await prisma.review.create({
      data: {
        bookId: book3.id,
        telegramUserId: BigInt(67890),
        telegramUsername: "maria_s",
        telegramDisplayName: "Мария Сидорова",
        reviewText: "Глубокий психологический роман",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-03"),
      },
    });
  });

  afterEach(async () => {
    await clearTestData(prisma);
  });

  describe("searchBooks", () => {
    it("should find books by title with partial match", async () => {
      const results = await searchBooks("Война", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Война и мир");
    });

    it("should find books by author with partial match", async () => {
      const results = await searchBooks("Толстой", 10, 0);

      expect(results.length).toBe(2);
      expect(results.every(b => b.author === "Лев Толстой")).toBe(true);
    });

    it("should include review counts and sentiments", async () => {
      const results = await searchBooks("Война", 10, 0);

      expect(results[0].reviewCount).toBe(1);
      expect(results[0].sentiments.positive).toBe(1);
    });

    it("should handle Cyrillic case variants", async () => {
      const lower = await searchBooks("война", 10, 0);
      const upper = await searchBooks("ВОЙНА", 10, 0);
      const mixed = await searchBooks("Война", 10, 0);

      expect(lower.length).toBe(1);
      expect(upper.length).toBe(1);
      expect(mixed.length).toBe(1);
    });

    it("should respect pagination", async () => {
      const page1 = await searchBooks("Толстой", 1, 0);
      const page2 = await searchBooks("Толстой", 1, 1);

      expect(page1.length).toBe(1);
      expect(page2.length).toBe(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe("searchAuthors", () => {
    it("should aggregate authors from books", async () => {
      const results = await searchAuthors("Толстой", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].name).toBe("Лев Толстой");
      expect(results[0].bookCount).toBe(2);
    });

    it("should count reviews across all author books", async () => {
      const results = await searchAuthors("Толстой", 10, 0);

      expect(results[0].reviewCount).toBe(2); // Reviews on both Tolstoy books
    });

    it("should find authors with partial name match", async () => {
      const results = await searchAuthors("Дост", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].name).toBe("Федор Достоевский");
    });
  });

  describe("searchUsers", () => {
    it("should aggregate users from reviews", async () => {
      const results = await searchUsers("Иван", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].displayName).toBe("Иван Петров");
      expect(results[0].reviewCount).toBe(2);
    });

    it("should find users by username", async () => {
      const results = await searchUsers("maria", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].username).toBe("maria_s");
    });

    it("should return user ID as string", async () => {
      const results = await searchUsers("Иван", 10, 0);

      expect(typeof results[0].odId).toBe("string");
      expect(results[0].odId).toBe("12345");
    });
  });

  describe("searchReviews", () => {
    it("should find reviews by text content", async () => {
      const results = await searchReviews("психологический", 10, 0);

      expect(results.length).toBe(1);
      expect(results[0].text).toContain("психологический");
    });

    it("should include book information", async () => {
      const results = await searchReviews("аристократии", 10, 0);

      expect(results[0].bookTitle).toBe("Война и мир");
    });

    it("should include reviewer information", async () => {
      const results = await searchReviews("психологический", 10, 0);

      expect(results[0].reviewerName).toBe("Мария Сидорова");
      expect(results[0].reviewerId).toBe("67890");
    });

    it("should return reviews ordered by date descending", async () => {
      const results = await searchReviews("роман", 10, 0); // matches both "Трагическая" and "психологический"

      if (results.length > 1) {
        const dates = results.map(r => new Date(r.reviewedAt).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }
    });
  });

  describe("searchAll", () => {
    it("should return results from all types", async () => {
      const response = await searchAll("Толстой", 20, 0);

      const types = response.results.map(r => r.type);
      expect(types).toContain("book");
      expect(types).toContain("author");
    });

    it("should order results by type priority (authors first)", async () => {
      const response = await searchAll("Толстой", 20, 0);

      // Find first book and first author indices
      const firstBookIndex = response.results.findIndex(r => r.type === "book");
      const firstAuthorIndex = response.results.findIndex(r => r.type === "author");

      if (firstBookIndex !== -1 && firstAuthorIndex !== -1) {
        expect(firstAuthorIndex).toBeLessThan(firstBookIndex);
      }
    });

    it("should handle pagination across types", async () => {
      // Get all results
      const full = await searchAll("и", 100, 0); // matches many items

      // Get paginated results
      const page1 = await searchAll("и", 5, 0);
      const page2 = await searchAll("и", 5, 5);

      expect(page1.results.length).toBeLessThanOrEqual(5);
      if (full.results.length > 5) {
        expect(page2.results.length).toBeGreaterThan(0);
      }
    });
  });

  describe("search (unified entry point)", () => {
    it("should route to correct search function based on type", async () => {
      const booksResult = await search("Толстой", "books", 10, 0);
      const authorsResult = await search("Толстой", "authors", 10, 0);
      const usersResult = await search("Иван", "users", 10, 0);
      const reviewsResult = await search("роман", "reviews", 10, 0);

      booksResult.results.forEach(r => expect(r.type).toBe("book"));
      authorsResult.results.forEach(r => expect(r.type).toBe("author"));
      usersResult.results.forEach(r => expect(r.type).toBe("user"));
      reviewsResult.results.forEach(r => expect(r.type).toBe("review"));
    });

    it("should return hasMore correctly for filtered searches", async () => {
      const result = await search("Толстой", "books", 1, 0);

      expect(result.hasMore).toBe(true); // We have 2 Tolstoy books
    });
  });
});
