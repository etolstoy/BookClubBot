import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "child_process";
import type { Context } from "telegraf";
import type { Message } from "telegraf/types";
import prisma from "../../src/lib/prisma.js";
import { handleReviewMessage } from "../../src/bot/handlers/review.js";
import { MockLLMClient } from "../../src/clients/llm/mock-llm-client.js";
import { MockBookDataClient } from "../../src/clients/book-data/mock-book-data-client.js";
import type { BotContext } from "../../src/bot/types/bot-context.js";
import { clearTestData } from "../helpers/test-db.js";
import {
  loadBookFixture,
  loadReviewFixture,
} from "../fixtures/helpers/fixture-loader.js";

vi.mock("../../src/services/notification.service.js", () => ({
  sendErrorNotification: vi.fn(),
  sendWarningNotification: vi.fn(),
}));

vi.mock("../../src/services/review-notification.service.js", () => ({
  notifySubscribersOfNewReview: vi.fn().mockResolvedValue(undefined),
}));

function createReviewContext(text: string, messageId = 900): Context {
  const message = {
    message_id: messageId,
    date: Math.floor(new Date("2026-01-15T12:00:00Z").getTime() / 1000),
    chat: {
      id: -1001234567890,
      type: "group",
      title: "Test Group",
    },
    from: {
      id: 12345678,
      is_bot: false,
      first_name: "Test",
      last_name: "User",
      username: "testuser",
    },
    text,
  } as Message;

  return {
    message,
    chat: message.chat,
    from: message.from,
    telegram: {
      setMessageReaction: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({}),
    },
    reply: vi.fn().mockResolvedValue({}),
  } as unknown as Context;
}

function createBotContext(
  llmClient: MockLLMClient,
  bookDataClient: MockBookDataClient
): BotContext {
  return {
    llmClient,
    bookDataClient,
  };
}

function seedBookData(mockBookDataClient: MockBookDataClient) {
  mockBookDataClient.seedBooks([
    loadBookFixture("great-gatsby"),
    loadBookFixture("1984"),
    loadBookFixture("war-and-peace"),
  ]);
}

describe.sequential("Review splitting handler integration", () => {
  let mockLLMClient: MockLLMClient;
  let mockBookDataClient: MockBookDataClient;
  let botContext: BotContext;

  beforeAll(() => {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      env: process.env,
    });
  });

  beforeEach(async () => {
    await clearTestData(prisma);
    mockLLMClient = new MockLLMClient();
    mockBookDataClient = new MockBookDataClient();
    seedBookData(mockBookDataClient);
    botContext = createBotContext(mockLLMClient, mockBookDataClient);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearTestData(prisma);
  });

  it("creates one review per clear concatenated part", async () => {
    const parts = [
      "BOOK 1\nLoved \"The Great Gatsby\" by F. Scott Fitzgerald.",
      "BOOK 2\n\"1984\" by George Orwell was bleak and excellent.",
      "BOOK 3\n«Война и мир» Льва Толстого took a while but paid off. #рецензия",
    ];
    const reviewText = parts.join("\n\n");
    const ctx = createReviewContext(reviewText);

    mockLLMClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });
    mockLLMClient.mockResponse(parts[0], {
      extractedInfo: {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        confidence: "high",
      },
      sentiment: "positive",
    });
    mockLLMClient.mockResponse(parts[1], {
      extractedInfo: {
        title: "1984",
        author: "George Orwell",
        confidence: "high",
      },
      sentiment: "positive",
    });
    mockLLMClient.mockResponse(parts[2], {
      extractedInfo: {
        title: "Война и мир",
        author: "Лев Толстой",
        confidence: "high",
      },
      sentiment: "positive",
    });

    await handleReviewMessage(ctx, botContext);

    const reviews = await prisma.review.findMany({
      orderBy: { id: "asc" },
      include: { book: true },
    });

    expect(reviews).toHaveLength(3);
    expect(reviews.map((review) => review.reviewText)).toEqual(parts);
    expect(reviews.map((review) => review.messageId?.toString())).toEqual([
      "900",
      "900",
      "900",
    ]);
    expect(reviews.map((review) => review.book?.title)).toEqual([
      "The Great Gatsby",
      "1984",
      "Война и мир",
    ]);
    expect(mockLLMClient.getCallCount("classifyReviewStructure")).toBe(1);
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(3);
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBe(3);
  });

  it("keeps comparative multi-book mentions as one review", async () => {
    const fixture = loadReviewFixture("multiple-books");
    const ctx = createReviewContext(fixture.reviewText, 901);

    mockLLMClient.mockResponse(fixture.reviewText, {
      reviewStructure: {
        kind: "single",
        parts: [fixture.reviewText],
      },
      extractedInfo: {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        confidence: "medium",
      },
      sentiment: "neutral",
    });

    await handleReviewMessage(ctx, botContext);

    const reviews = await prisma.review.findMany();

    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewText).toBe(fixture.reviewText);
    expect(reviews[0].bookId).toBeNull();
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBe(1);
  });

  it("blocks duplicate processing for an already split source message", async () => {
    const parts = [
      "BOOK 1\nLoved \"The Great Gatsby\" by F. Scott Fitzgerald.",
      "BOOK 2\n\"1984\" by George Orwell was bleak. #рецензия",
    ];
    const reviewText = parts.join("\n\n");
    const firstCtx = createReviewContext(reviewText, 902);
    const secondCtx = createReviewContext(reviewText, 902);

    mockLLMClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });
    mockLLMClient.mockResponse(parts[0], {
      extractedInfo: {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        confidence: "high",
      },
      sentiment: "positive",
    });
    mockLLMClient.mockResponse(parts[1], {
      extractedInfo: {
        title: "1984",
        author: "George Orwell",
        confidence: "high",
      },
      sentiment: "negative",
    });

    await handleReviewMessage(firstCtx, botContext);
    mockLLMClient.clearCallLog();
    await handleReviewMessage(secondCtx, botContext);

    const reviewCount = await prisma.review.count({
      where: {
        telegramUserId: BigInt(12345678),
        messageId: BigInt(902),
      },
    });

    expect(reviewCount).toBe(2);
    expect(mockLLMClient.getCallCount("classifyReviewStructure")).toBe(1);
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(0);
    expect(secondCtx.reply).toHaveBeenCalledWith(
      "@testuser, эта рецензия уже была сохранена!",
      { reply_parameters: { message_id: 902 } }
    );
  });

  it("continues processing later parts when one part fails", async () => {
    const parts = [
      "BOOK 1\nThis one will fail.",
      "BOOK 2\n\"1984\" by George Orwell was bleak. #рецензия",
    ];
    const reviewText = parts.join("\n\n");
    const ctx = createReviewContext(reviewText, 903);

    mockLLMClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });
    mockLLMClient.mockResponse(parts[0], {
      shouldThrow: true,
      error: new Error("Extraction failed"),
    });
    mockLLMClient.mockResponse(parts[1], {
      extractedInfo: {
        title: "1984",
        author: "George Orwell",
        confidence: "high",
      },
      sentiment: "negative",
    });

    await handleReviewMessage(ctx, botContext);

    const reviews = await prisma.review.findMany({
      include: { book: true },
    });

    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewText).toBe(parts[1]);
    expect(reviews[0].book?.title).toBe("1984");
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(2);
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBe(1);
  });

  it("retries only missing parts for a partially saved split source message", async () => {
    const parts = [
      "BOOK 1\nLoved \"The Great Gatsby\" by F. Scott Fitzgerald.",
      "BOOK 2\n\"1984\" by George Orwell failed the first time. #рецензия",
    ];
    const reviewText = parts.join("\n\n");
    const firstCtx = createReviewContext(reviewText, 904);
    const retryCtx = createReviewContext(reviewText, 904);

    mockLLMClient.mockResponse(reviewText, {
      reviewStructure: {
        kind: "concatenated",
        parts,
      },
    });
    mockLLMClient.mockResponse(parts[0], {
      extractedInfo: {
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        confidence: "high",
      },
      sentiment: "positive",
    });
    mockLLMClient.mockResponse(parts[1], {
      shouldThrow: true,
      error: new Error("Extraction failed"),
    });

    await handleReviewMessage(firstCtx, botContext);

    let reviews = await prisma.review.findMany({
      orderBy: { id: "asc" },
      include: { book: true },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewText).toBe(parts[0]);

    mockLLMClient.mockResponse(parts[1], {
      extractedInfo: {
        title: "1984",
        author: "George Orwell",
        confidence: "high",
      },
      sentiment: "negative",
    });
    mockLLMClient.clearCallLog();

    await handleReviewMessage(retryCtx, botContext);

    reviews = await prisma.review.findMany({
      orderBy: { id: "asc" },
      include: { book: true },
    });

    expect(reviews).toHaveLength(2);
    expect(reviews.map((review) => review.reviewText)).toEqual(parts);
    expect(reviews.map((review) => review.book?.title)).toEqual([
      "The Great Gatsby",
      "1984",
    ]);
    expect(mockLLMClient.getCallCount("classifyReviewStructure")).toBe(1);
    expect(mockLLMClient.getCallCount("extractBookInfo")).toBe(1);
    expect(mockLLMClient.getMethodCalls("extractBookInfo")[0].args[0]).toBe(parts[1]);
    expect(mockLLMClient.getCallCount("analyzeSentiment")).toBe(1);
    expect(retryCtx.reply).not.toHaveBeenCalledWith(
      "@testuser, эта рецензия уже была сохранена!",
      { reply_parameters: { message_id: 904 } }
    );
  });
});
