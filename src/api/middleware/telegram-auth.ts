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
    if (
      !crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(calculatedHash)
      )
    ) {
      console.warn("[TelegramAuth] Invalid hash signature");
      return null;
    }

    // Check auth_date (data freshness - reject if older than 5 minutes)
    const authDate = params.get("auth_date");
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const maxAge = 300; // 5 minutes in seconds

      if (currentTimestamp - authTimestamp > maxAge) {
        console.warn(
          "[TelegramAuth] initData expired (older than 5 minutes)"
        );
        return null;
      }
    }

    // Parse user data
    const userJson = params.get("user");
    if (!userJson) {
      return null;
    }

    const user = JSON.parse(userJson);

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
    req.telegramUser = {
      id: BigInt(req.headers["x-dev-user-id"] as string),
      username: "devuser",
      first_name: "Dev",
      last_name: "User",
    };
    next();
    return;
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
