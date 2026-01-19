import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../../lib/config.js";

export interface TelegramUser {
  id: bigint;
  username?: string;
  first_name?: string;
  last_name?: string;
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
    }
  }
}

/**
 * Validates Telegram WebApp initData signature using HMAC-SHA256
 * Based on: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export function validateTelegramWebAppData(
  initData: string
): TelegramUser | null {
  try {
    // Parse initData as URLSearchParams
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return null;
    }

    // Remove hash from params to create data-check-string
    params.delete("hash");

    // Sort params alphabetically and create data-check-string
    const dataCheckArray: string[] = [];
    Array.from(params.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .forEach(([key, value]) => {
        dataCheckArray.push(`${key}=${value}`);
      });

    const dataCheckString = dataCheckArray.join("\n");

    // Generate secret key: HMAC-SHA256(bot_token, "WebAppData")
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(config.botToken)
      .digest();

    // Calculate hash: HMAC-SHA256(data-check-string, secret_key)
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    // Compare hashes (constant-time comparison)
    // Must ensure buffer lengths match before calling timingSafeEqual
    const hashBuffer = Buffer.from(hash, "hex");
    const calculatedBuffer = Buffer.from(calculatedHash, "hex");

    if (hashBuffer.length !== calculatedBuffer.length) {
      console.warn("[TelegramAuth] Invalid hash length");
      return null;
    }

    if (!crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      console.warn("[TelegramAuth] Invalid hash signature");
      return null;
    }

    // Check auth_date (data freshness - reject if older than 1 hour)
    // Note: This is set to 1 hour to allow users to keep the Mini App open
    // The HMAC signature validation already ensures data integrity
    const authDate = params.get("auth_date");
    if (!authDate) {
      console.warn("[TelegramAuth] Missing auth_date");
      return null;
    }

    const authTimestamp = parseInt(authDate, 10);
    if (isNaN(authTimestamp)) {
      console.warn("[TelegramAuth] Invalid auth_date format");
      return null;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const maxAge = 3600; // 1 hour in seconds

    // Check if auth_date is in the future (allow 60s clock skew)
    if (authTimestamp > currentTimestamp + 60) {
      console.warn("[TelegramAuth] auth_date is in the future");
      return null;
    }

    // Check if auth_date is too old
    if (currentTimestamp - authTimestamp > maxAge) {
      console.warn("[TelegramAuth] initData expired (older than 1 hour)");
      return null;
    }

    // Parse user data
    const userJson = params.get("user");
    if (!userJson) {
      return null;
    }

    const user = JSON.parse(userJson);

    if (!user.id || typeof user.id !== "number") {
      console.warn("[TelegramAuth] Invalid user.id");
      return null;
    }

    return {
      id: BigInt(user.id),
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
    };
  } catch (error) {
    console.error("[TelegramAuth] Validation error:", error);
    return null;
  }
}

/**
 * Express middleware to authenticate Telegram WebApp requests
 * Expects initData in Authorization header: "Bearer <initData>"
 */
export function authenticateTelegramWebApp(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // DEV ONLY: Allow testing without real Telegram auth
  if (config.isDev && req.headers["x-dev-user-id"]) {
    try {
      const userId = BigInt(req.headers["x-dev-user-id"] as string);
      req.telegramUser = {
        id: userId,
        username: "devuser",
        first_name: "Dev",
        last_name: "User",
      };
      next();
      return;
    } catch (error) {
      console.error("[TelegramAuth] Invalid dev user ID:", error);
      res.status(400).json({ error: "Invalid x-dev-user-id header" });
      return;
    }
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const initData = authHeader.substring(7); // Remove "Bearer " prefix
  const user = validateTelegramWebAppData(initData);

  if (!user) {
    res
      .status(401)
      .json({ error: "Invalid Telegram WebApp authentication" });
    return;
  }

  req.telegramUser = user;
  next();
}

/**
 * Optional middleware - allows unauthenticated requests but attaches user if present
 */
export function optionalTelegramAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const initData = authHeader.substring(7);
    const user = validateTelegramWebAppData(initData);

    if (user) {
      req.telegramUser = user;
    }
  }

  next();
}
