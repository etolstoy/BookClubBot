/**
 * Unit tests for subscription handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSubscribeCommand,
  handleSubscriptionToggle,
  TOGGLE_CALLBACK_DATA,
} from "../../src/bot/handlers/subscription.js";

// Mock dependencies
vi.mock("../../src/services/subscription.service.js", () => ({
  getSubscription: vi.fn(),
  createSubscription: vi.fn(),
  toggleSubscription: vi.fn(),
  getSubscriberCount: vi.fn(),
}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    adminUserIds: [BigInt(999)],
  },
}));

import * as subscriptionService from "../../src/services/subscription.service.js";
import { config } from "../../src/lib/config.js";

// Helper to create mock Telegraf context
function createMockContext(overrides: Record<string, any> = {}) {
  return {
    chat: { type: "private", id: 123 },
    from: { id: 12345 },
    callbackQuery: null,
    reply: vi.fn().mockResolvedValue({}),
    editMessageText: vi.fn().mockResolvedValue({}),
    answerCbQuery: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("Subscription Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TOGGLE_CALLBACK_DATA", () => {
    it("should export the callback data constant", () => {
      expect(TOGGLE_CALLBACK_DATA).toBe("toggle_subscription");
    });
  });

  describe("handleSubscribeCommand", () => {
    it("should ignore non-private chats (group)", async () => {
      const ctx = createMockContext({
        chat: { type: "group", id: -123456 },
      });

      await handleSubscribeCommand(ctx as any);

      expect(ctx.reply).not.toHaveBeenCalled();
      expect(subscriptionService.getSubscription).not.toHaveBeenCalled();
    });

    it("should ignore non-private chats (supergroup)", async () => {
      const ctx = createMockContext({
        chat: { type: "supergroup", id: -1001234567890 },
      });

      await handleSubscribeCommand(ctx as any);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should return early when no user id", async () => {
      const ctx = createMockContext({
        from: null,
      });

      await handleSubscribeCommand(ctx as any);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("should show enabled status for active subscription", async () => {
      vi.mocked(subscriptionService.getSubscription).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(12345),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createMockContext();

      await handleSubscribeCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("включены"),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: "Отключить",
                  callback_data: "toggle_subscription",
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it("should show disabled status for inactive subscription", async () => {
      vi.mocked(subscriptionService.getSubscription).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(12345),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createMockContext();

      await handleSubscribeCommand(ctx as any);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("отключены"),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: "Включить",
                  callback_data: "toggle_subscription",
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it("should create new subscription when none exists", async () => {
      vi.mocked(subscriptionService.getSubscription).mockResolvedValue(null);
      vi.mocked(subscriptionService.createSubscription).mockResolvedValue({ isActive: true });
      const ctx = createMockContext();

      await handleSubscribeCommand(ctx as any);

      expect(subscriptionService.createSubscription).toHaveBeenCalledWith(BigInt(12345));
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("включены"),
        expect.any(Object)
      );
    });

    it("should not show subscriber count for admin users", async () => {
      vi.mocked(subscriptionService.getSubscription).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(999),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createMockContext({
        from: { id: 999 }, // Admin user
      });

      await handleSubscribeCommand(ctx as any);

      expect(subscriptionService.getSubscriberCount).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.not.stringContaining("Всего подписчиков"),
        expect.any(Object)
      );
    });

    it("should not show subscriber count for non-admin users", async () => {
      vi.mocked(subscriptionService.getSubscription).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(12345),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createMockContext();

      await handleSubscribeCommand(ctx as any);

      expect(subscriptionService.getSubscriberCount).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.not.stringContaining("подписчиков"),
        expect.any(Object)
      );
    });
  });

  describe("handleSubscriptionToggle", () => {
    it("should return early when no callback query", async () => {
      const ctx = createMockContext({
        callbackQuery: null,
      });

      await handleSubscriptionToggle(ctx as any);

      expect(subscriptionService.toggleSubscription).not.toHaveBeenCalled();
    });

    it("should return early when callback query has no data", async () => {
      const ctx = createMockContext({
        callbackQuery: { id: "123" }, // No 'data' property
      });

      await handleSubscriptionToggle(ctx as any);

      expect(subscriptionService.toggleSubscription).not.toHaveBeenCalled();
    });

    it("should return early when no user id", async () => {
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
        from: null,
      });

      await handleSubscriptionToggle(ctx as any);

      expect(subscriptionService.toggleSubscription).not.toHaveBeenCalled();
    });

    it("should toggle subscription and update message", async () => {
      vi.mocked(subscriptionService.toggleSubscription).mockResolvedValue({ isActive: false });
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
      });

      await handleSubscriptionToggle(ctx as any);

      expect(subscriptionService.toggleSubscription).toHaveBeenCalledWith(BigInt(12345));
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("отключены"),
        expect.any(Object)
      );
      expect(ctx.answerCbQuery).toHaveBeenCalled();
    });

    it("should toggle subscription from off to on", async () => {
      vi.mocked(subscriptionService.toggleSubscription).mockResolvedValue({ isActive: true });
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
      });

      await handleSubscriptionToggle(ctx as any);

      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("включены"),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: "Отключить",
                }),
              ]),
            ]),
          }),
        })
      );
    });

    it("should answer callback query even if edit fails", async () => {
      vi.mocked(subscriptionService.toggleSubscription).mockResolvedValue({ isActive: true });
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
      });
      ctx.editMessageText.mockRejectedValue(new Error("Message is not modified"));

      await handleSubscriptionToggle(ctx as any);

      expect(ctx.answerCbQuery).toHaveBeenCalled();
    });

    it("should not throw when edit message fails", async () => {
      vi.mocked(subscriptionService.toggleSubscription).mockResolvedValue({ isActive: true });
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
      });
      ctx.editMessageText.mockRejectedValue(new Error("Message is too old"));

      // Should not throw
      await expect(handleSubscriptionToggle(ctx as any)).resolves.toBeUndefined();
    });

    it("should not show admin count when admin toggles", async () => {
      vi.mocked(subscriptionService.toggleSubscription).mockResolvedValue({ isActive: true });
      const ctx = createMockContext({
        callbackQuery: { id: "123", data: "toggle_subscription" },
        from: { id: 999 }, // Admin
      });

      await handleSubscriptionToggle(ctx as any);

      expect(subscriptionService.getSubscriberCount).not.toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.not.stringContaining("Всего подписчиков"),
        expect.any(Object)
      );
    });
  });
});
