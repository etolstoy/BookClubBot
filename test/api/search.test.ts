import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import searchRouter from "../../src/api/routes/search.js";
import prisma from "../../src/lib/prisma.js";
import { clearTestData } from "../helpers/test-db.js";

describe.sequential("GET /api/search", () => {
  let app: express.Application;

  beforeEach(async () => {
    // Clear test data
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

    // Create reviews
    await prisma.review.create({
      data: {
        bookId: book1.id,
        telegramUserId: BigInt(12345),
        telegramUsername: "testuser",
        telegramDisplayName: "Иван Петров",
        reviewText: "Отличная книга про войну и мир!",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-01"),
      },
    });

    await prisma.review.create({
      data: {
        bookId: book2.id,
        telegramUserId: BigInt(12345),
        telegramUsername: "testuser",
        telegramDisplayName: "Иван Петров",
        reviewText: "Прекрасный роман об Анне",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-02"),
      },
    });

    await prisma.review.create({
      data: {
        bookId: book3.id,
        telegramUserId: BigInt(67890),
        telegramUsername: "reader2",
        telegramDisplayName: "Мария Сидорова",
        reviewText: "Достоевский гений!",
        sentiment: "positive",
        reviewedAt: new Date("2024-01-03"),
      },
    });

    // Setup Express app
    app = express();
    app.use("/api/search", searchRouter);
  });

  afterEach(async () => {
    await clearTestData(prisma);
  });

  describe("query validation", () => {
    it("should return 400 when query is missing", async () => {
      const response = await request(app).get("/api/search");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("required");
    });

    it("should return 400 when query is less than 2 characters", async () => {
      const response = await request(app).get("/api/search?q=а");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("2 characters");
    });

    it("should return 400 for invalid type parameter", async () => {
      const response = await request(app).get("/api/search?q=test&type=invalid");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid type");
    });
  });

  describe("type=all (mixed results)", () => {
    it("should return mixed results ordered by type priority", async () => {
      const response = await request(app).get("/api/search?q=Толстой&type=all");

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
      expect(response.body.hasMore).toBeDefined();

      // Should have authors first, then books
      const types = response.body.results.map((r: any) => r.type);
      const bookIndex = types.indexOf("book");
      const authorIndex = types.indexOf("author");

      // Authors should come before books
      if (bookIndex !== -1 && authorIndex !== -1) {
        expect(authorIndex).toBeLessThan(bookIndex);
      }
    });
  });

  describe("type=books", () => {
    it("should return only book results", async () => {
      const response = await request(app).get("/api/search?q=Война&type=books");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeGreaterThan(0);
      response.body.results.forEach((result: any) => {
        expect(result.type).toBe("book");
      });
    });

    it("should match books by title", async () => {
      const response = await request(app).get("/api/search?q=Каренина&type=books");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
      expect(response.body.results[0].data.title).toBe("Анна Каренина");
    });

    it("should match books by author", async () => {
      const response = await request(app).get("/api/search?q=Достоевский&type=books");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
      expect(response.body.results[0].data.author).toBe("Федор Достоевский");
    });
  });

  describe("type=authors", () => {
    it("should return aggregated author results", async () => {
      const response = await request(app).get("/api/search?q=Толстой&type=authors");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);

      const author = response.body.results[0];
      expect(author.type).toBe("author");
      expect(author.data.name).toBe("Лев Толстой");
      expect(author.data.bookCount).toBe(2); // 2 books by Толстой
      expect(author.data.reviewCount).toBe(2); // 2 reviews on those books
    });
  });

  describe("type=users", () => {
    it("should return users matching display name", async () => {
      const response = await request(app).get("/api/search?q=Иван&type=users");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);

      const user = response.body.results[0];
      expect(user.type).toBe("user");
      expect(user.data.displayName).toBe("Иван Петров");
      expect(user.data.reviewCount).toBe(2);
    });

    it("should return users matching username", async () => {
      const response = await request(app).get("/api/search?q=reader&type=users");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);

      const user = response.body.results[0];
      expect(user.type).toBe("user");
      expect(user.data.username).toBe("reader2");
    });
  });

  describe("type=reviews", () => {
    it("should return reviews matching text content", async () => {
      const response = await request(app).get("/api/search?q=гений&type=reviews");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);

      const review = response.body.results[0];
      expect(review.type).toBe("review");
      expect(review.data.text).toContain("гений");
    });
  });

  describe("pagination", () => {
    it("should respect limit parameter", async () => {
      const response = await request(app).get("/api/search?q=Толстой&type=books&limit=1");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
      expect(response.body.hasMore).toBe(true);
    });

    it("should respect offset parameter", async () => {
      const response = await request(app).get("/api/search?q=Толстой&type=books&limit=1&offset=1");

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBe(1);
      // Should get the second book
    });

    it("should return hasMore=false when no more results", async () => {
      const response = await request(app).get("/api/search?q=Достоевский&type=books&limit=10");

      expect(response.status).toBe(200);
      expect(response.body.hasMore).toBe(false);
    });
  });

  describe("case insensitivity", () => {
    it("should match regardless of case (Cyrillic)", async () => {
      const response1 = await request(app).get("/api/search?q=толстой&type=authors");
      const response2 = await request(app).get("/api/search?q=ТОЛСТОЙ&type=authors");
      const response3 = await request(app).get("/api/search?q=Толстой&type=authors");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);

      expect(response1.body.results.length).toBe(1);
      expect(response2.body.results.length).toBe(1);
      expect(response3.body.results.length).toBe(1);
    });
  });

  describe("empty results", () => {
    it("should return empty results array for no matches", async () => {
      const response = await request(app).get("/api/search?q=несуществующая&type=all");

      expect(response.status).toBe(200);
      expect(response.body.results).toEqual([]);
      expect(response.body.hasMore).toBe(false);
    });
  });
});
