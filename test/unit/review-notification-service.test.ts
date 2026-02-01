/**
 * Unit tests for review notification service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifySubscribersOfNewReview, type ReviewWithBook } from "../../src/services/review-notification.service.js";

// Mock dependencies
vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    review: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/services/subscription.service.js", () => ({
  getActiveSubscribers: vi.fn(),
  deactivateSubscription: vi.fn(),
}));

vi.mock("../../src/services/notification.service.js", () => ({
  sendWarningNotification: vi.fn(),
}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    botUsername: "test_bot",
  },
}));

import prisma from "../../src/lib/prisma.js";
import * as subscriptionService from "../../src/services/subscription.service.js";
import * as notificationService from "../../src/services/notification.service.js";

// Mock Telegram API client
function createMockTelegram() {
  return {
    sendMessage: vi.fn().mockResolvedValue({}),
  };
}

// Helper to create test review data
function createMockReview(overrides: Partial<ReviewWithBook> = {}): ReviewWithBook {
  return {
    id: 1,
    telegramUserId: BigInt(111),
    telegramUsername: "test_user",
    telegramDisplayName: "Test User",
    telegramChatId: BigInt(-1001234567890),
    telegramMessageId: BigInt(12345),
    reviewText: "Great book!",
    sentiment: "positive",
    bookId: 1,
    createdAt: new Date(),
    book: {
      id: 1,
      googleBooksId: "abc123",
      title: "Test Book",
      author: "Test Author",
      coverUrl: "https://example.com/cover.jpg",
      description: "A test book",
      publishedDate: "2024",
      pageCount: 200,
      categories: null,
      averageRating: null,
      ratingsCount: null,
      isbn10: null,
      isbn13: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

describe("Review Notification Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("notifySubscribersOfNewReview", () => {
    it("should skip notification when no active subscribers", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([]);
      const mockTelegram = createMockTelegram();
      const review = createMockReview();

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });

    it("should send text message when book has cover", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview();

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        "222",
        expect.stringContaining("Test Book"),
        expect.objectContaining({
          parse_mode: "HTML",
        })
      );
    });

    it("should send text message when book has no cover", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        book: {
          id: 1,
          googleBooksId: "abc123",
          title: "Test Book",
          author: "Test Author",
          coverUrl: null,
          description: null,
          publishedDate: null,
          pageCount: null,
          categories: null,
          averageRating: null,
          ratingsCount: null,
          isbn10: null,
          isbn13: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        "222",
        expect.stringContaining("Test Book"),
        expect.objectContaining({
          parse_mode: "HTML",
        })
      );
    });

    it("should send text message for orphaned review (no book)", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        bookId: null,
        book: null,
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        "222",
        expect.stringContaining("Test User"),
        expect.objectContaining({
          parse_mode: "HTML",
        })
      );
    });

    it("should include reviewer info in notification", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        telegramDisplayName: "John Doe",
        telegramUsername: "johndoe",
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("John Doe"),
        expect.any(Object)
      );
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("@johndoe"),
        expect.any(Object)
      );
    });

    it("should show anonymous for reviewer without display name", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        telegramDisplayName: null,
        telegramUsername: null,
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Аноним"),
        expect.any(Object)
      );
    });

    it("should escape HTML in user-generated content", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        reviewText: "Book with <script>alert('xss')</script> content",
        telegramDisplayName: "User & Friend",
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      const textArg = mockTelegram.sendMessage.mock.calls[0][1];
      expect(textArg).toContain("&lt;script&gt;");
      expect(textArg).toContain("&amp;");
      expect(textArg).not.toContain("<script>");
    });

    it("should send to multiple subscribers", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([
        BigInt(111),
        BigInt(222),
        BigInt(333),
      ]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview();

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith("111", expect.any(String), expect.any(Object));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith("222", expect.any(String), expect.any(Object));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith("333", expect.any(String), expect.any(Object));
    });

    it("should auto-deactivate subscription when bot is blocked (403)", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      mockTelegram.sendMessage.mockRejectedValue(new Error("403: Forbidden: bot was blocked by the user"));
      const review = createMockReview();

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(subscriptionService.deactivateSubscription).toHaveBeenCalledWith(BigInt(222));
    });

    it("should not throw on delivery failure", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      mockTelegram.sendMessage.mockRejectedValue(new Error("Network error"));
      const review = createMockReview();

      // Should not throw - fire-and-forget behavior
      await expect(notifySubscribersOfNewReview(review, mockTelegram as any)).resolves.toBeUndefined();
    });

    it("should include sentiment breakdown in notification", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
        { sentiment: "positive" },
        { sentiment: "neutral" },
        { sentiment: "negative" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview();

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      const textArg = mockTelegram.sendMessage.mock.calls[0][1];
      expect(textArg).toMatch(/👍 2/);
      expect(textArg).toMatch(/😐 1/);
      expect(textArg).toMatch(/👎 1/);
      expect(textArg).toContain("4 рецензии");
    });

    it("should include deep link button when book exists", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      vi.mocked(prisma.review.findMany).mockResolvedValue([
        { sentiment: "positive" },
      ] as any);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({ bookId: 42 });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: "📖 Смотреть в приложении",
                  url: expect.stringContaining("book_42"),
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it("should not include deep link button for orphaned review", async () => {
      vi.mocked(subscriptionService.getActiveSubscribers).mockResolvedValue([BigInt(222)]);
      const mockTelegram = createMockTelegram();
      const review = createMockReview({
        bookId: null,
        book: null,
      });

      await notifySubscribersOfNewReview(review, mockTelegram as any);

      const callArgs = mockTelegram.sendMessage.mock.calls[0][2];
      expect(callArgs.reply_markup).toBeUndefined();
    });
  });
});
