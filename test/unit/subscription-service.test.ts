/**
 * Unit tests for subscription service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSubscription,
  createSubscription,
  toggleSubscription,
  getActiveSubscribers,
  getSubscriberCount,
  deactivateSubscription,
} from "../../src/services/subscription.service.js";

// Mock Prisma client
vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    subscription: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import prisma from "../../src/lib/prisma.js";

describe("Subscription Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSubscription", () => {
    it("should return subscription when exists", async () => {
      const mockSubscription = {
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(mockSubscription);

      const result = await getSubscription(BigInt(123456));

      expect(result).toEqual(mockSubscription);
      expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { telegramUserId: BigInt(123456) },
      });
    });

    it("should return null when subscription not found", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      const result = await getSubscription(BigInt(999999));

      expect(result).toBeNull();
    });
  });

  describe("createSubscription", () => {
    it("should create subscription with default isActive=true", async () => {
      vi.mocked(prisma.subscription.create).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createSubscription(BigInt(123456));

      expect(result).toEqual({ isActive: true });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: { telegramUserId: BigInt(123456) },
      });
    });
  });

  describe("toggleSubscription", () => {
    it("should toggle existing subscription from true to false", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await toggleSubscription(BigInt(123456));

      expect(result).toEqual({ isActive: false });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { telegramUserId: BigInt(123456) },
        data: { isActive: false },
      });
    });

    it("should toggle existing subscription from false to true", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await toggleSubscription(BigInt(123456));

      expect(result).toEqual({ isActive: true });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { telegramUserId: BigInt(123456) },
        data: { isActive: true },
      });
    });

    it("should create new subscription if not exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.subscription.create).mockResolvedValue({
        id: 1,
        telegramUserId: BigInt(123456),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await toggleSubscription(BigInt(123456));

      expect(result).toEqual({ isActive: true });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: { telegramUserId: BigInt(123456) },
      });
    });
  });

  describe("getActiveSubscribers", () => {
    it("should return array of active subscriber IDs", async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValue([
        { telegramUserId: BigInt(111) },
        { telegramUserId: BigInt(222) },
        { telegramUserId: BigInt(333) },
      ] as any);

      const result = await getActiveSubscribers();

      expect(result).toEqual([BigInt(111), BigInt(222), BigInt(333)]);
      expect(prisma.subscription.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { telegramUserId: true },
      });
    });

    it("should return empty array when no active subscribers", async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

      const result = await getActiveSubscribers();

      expect(result).toEqual([]);
    });
  });

  describe("getSubscriberCount", () => {
    it("should return count of active subscribers", async () => {
      vi.mocked(prisma.subscription.count).mockResolvedValue(42);

      const result = await getSubscriberCount();

      expect(result).toBe(42);
      expect(prisma.subscription.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it("should return 0 when no active subscribers", async () => {
      vi.mocked(prisma.subscription.count).mockResolvedValue(0);

      const result = await getSubscriberCount();

      expect(result).toBe(0);
    });
  });

  describe("deactivateSubscription", () => {
    it("should set isActive to false for active subscription", async () => {
      vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 });

      await deactivateSubscription(BigInt(123456));

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { telegramUserId: BigInt(123456), isActive: true },
        data: { isActive: false },
      });
    });

    it("should not throw when subscription does not exist", async () => {
      vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 0 });

      await expect(deactivateSubscription(BigInt(999999))).resolves.toBeUndefined();
    });
  });
});
