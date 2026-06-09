import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createSubscriptionsRouter } from "../../src/api/routes/subscriptions.js";
import { setAuthMiddleware } from "../../src/api/middleware/telegram-auth.js";
import { activateSubscription } from "../../src/services/subscription.service.js";

vi.mock("../../src/services/subscription.service.js", () => ({
  activateSubscription: vi.fn(),
}));

function createApp(bot: any) {
  const app = express();
  app.use(express.json());
  app.use("/api/subscriptions", createSubscriptionsRouter(bot));
  return app;
}

describe("POST /api/subscriptions/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Telegram auth", async () => {
    setAuthMiddleware((req, res) => {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
    });

    const bot = {
      telegram: {
        sendChatAction: vi.fn(),
      },
    };

    const response = await request(createApp(bot)).post("/api/subscriptions/activate");

    expect(response.status).toBe(401);
    expect(bot.telegram.sendChatAction).not.toHaveBeenCalled();
    expect(activateSubscription).not.toHaveBeenCalled();
  });

  it("should activate subscription when bot can message the user", async () => {
    setAuthMiddleware((req, res, next) => {
      req.telegramUser = { id: BigInt(12345) };
      next();
    });

    const bot = {
      telegram: {
        sendChatAction: vi.fn().mockResolvedValue(true),
      },
    };
    vi.mocked(activateSubscription).mockResolvedValue({ isActive: true });

    const response = await request(createApp(bot)).post("/api/subscriptions/activate");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ isActive: true });
    expect(bot.telegram.sendChatAction).toHaveBeenCalledWith("12345", "typing");
    expect(activateSubscription).toHaveBeenCalledWith(BigInt(12345));
  });

  it("should return fallback response when private chat is unavailable", async () => {
    setAuthMiddleware((req, res, next) => {
      req.telegramUser = { id: BigInt(12345) };
      next();
    });

    const bot = {
      telegram: {
        sendChatAction: vi
          .fn()
          .mockRejectedValue(new Error("403: Forbidden: bot was blocked by the user")),
      },
    };

    const response = await request(createApp(bot)).post("/api/subscriptions/activate");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "Bot private chat required",
      code: "BOT_PRIVATE_CHAT_REQUIRED",
    });
    expect(activateSubscription).not.toHaveBeenCalled();
  });
});
