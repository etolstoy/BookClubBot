/**
 * Unit tests for reaction service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { addReaction } from "../../src/services/reaction.service.js";
import * as notificationService from "../../src/services/notification.service.js";

// Mock Telegram bot instance
const mockBot = {
  telegram: {
    setMessageReaction: vi.fn(),
  },
};

// Mock notification service
vi.mock("../../src/services/notification.service.js", () => ({
  sendErrorNotification: vi.fn(),
}));

describe("Reaction Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addReaction", () => {
    it("should add reaction successfully", async () => {
      mockBot.telegram.setMessageReaction.mockResolvedValue(true);

      await addReaction(
        mockBot as any,
        -1001234567890,
        123,
        "👀"
      );

      expect(mockBot.telegram.setMessageReaction).toHaveBeenCalledWith(
        -1001234567890,
        123,
        [{ type: "👀", is_big: false }]
      );
      expect(notificationService.sendErrorNotification).not.toHaveBeenCalled();
    });

    it("should support all emoji types (👀, ✅, ❌)", async () => {
      mockBot.telegram.setMessageReaction.mockResolvedValue(true);

      await addReaction(mockBot as any, 123, 456, "👀");
      await addReaction(mockBot as any, 123, 456, "✅");
      await addReaction(mockBot as any, 123, 456, "❌");

      expect(mockBot.telegram.setMessageReaction).toHaveBeenCalledTimes(3);
      expect(mockBot.telegram.setMessageReaction).toHaveBeenNthCalledWith(
        1,
        123,
        456,
        [{ type: "👀", is_big: false }]
      );
      expect(mockBot.telegram.setMessageReaction).toHaveBeenNthCalledWith(
        2,
        123,
        456,
        [{ type: "✅", is_big: false }]
      );
      expect(mockBot.telegram.setMessageReaction).toHaveBeenNthCalledWith(
        3,
        123,
        456,
        [{ type: "❌", is_big: false }]
      );
    });

    it("should not throw on reaction failure", async () => {
      const error = new Error("Telegram API error");
      mockBot.telegram.setMessageReaction.mockRejectedValue(error);

      // Should not throw
      await expect(
        addReaction(mockBot as any, 123, 456, "✅")
      ).resolves.toBeUndefined();
    });

    it("should notify admin on reaction failure", async () => {
      const error = new Error("Telegram API error");
      mockBot.telegram.setMessageReaction.mockRejectedValue(error);

      await addReaction(mockBot as any, 123, 456, "✅");

      expect(notificationService.sendErrorNotification).toHaveBeenCalledWith(
        "Failed to add reaction",
        expect.objectContaining({
          chatId: "123", // chatId is converted to string
          messageId: 456,
          emoji: "✅",
          error: error.message,
        })
      );
    });

    it("should handle BigInt chatId", async () => {
      mockBot.telegram.setMessageReaction.mockResolvedValue(true);

      await addReaction(
        mockBot as any,
        BigInt("-1001234567890"),
        123,
        "👀"
      );

      expect(mockBot.telegram.setMessageReaction).toHaveBeenCalledWith(
        expect.any(String), // BigInt converted to string or number
        123,
        [{ type: "👀", is_big: false }]
      );
    });

    it("should handle reaction API returning false (no error thrown)", async () => {
      mockBot.telegram.setMessageReaction.mockResolvedValue(false);

      // Should not throw even if API returns false
      await expect(
        addReaction(mockBot as any, 123, 456, "✅")
      ).resolves.toBeUndefined();

      // Should not notify admin if no error thrown (false is acceptable)
      expect(notificationService.sendErrorNotification).not.toHaveBeenCalled();
    });

    it("should be non-blocking - continue processing even on failure", async () => {
      mockBot.telegram.setMessageReaction.mockRejectedValue(
        new Error("Network error")
      );

      const startTime = Date.now();
      await addReaction(mockBot as any, 123, 456, "✅");
      const duration = Date.now() - startTime;

      // Should complete quickly (non-blocking)
      expect(duration).toBeLessThan(100);

      // Should have logged error but not thrown
      expect(notificationService.sendErrorNotification).toHaveBeenCalled();
    });
  });
});
