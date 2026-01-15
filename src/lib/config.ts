import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  MINI_APP_URL: z.string().url().optional().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  TARGET_CHAT_ID: z.string().optional(),
  ADMIN_CHAT_ID: z.string().optional(),
  ADMIN_USER_IDS: z.string().optional(),
  PORT: z.string().default("3001"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

function parseBigInt(value: string | undefined): bigint | undefined {
  return value ? BigInt(value) : undefined;
}

function parseBigIntList(value: string | undefined): bigint[] {
  if (!value) return [];
  return value.split(",").map((id) => BigInt(id.trim()));
}

export const config = {
  botToken: parsed.data.BOT_TOKEN,
  miniAppUrl: parsed.data.MINI_APP_URL,
  databaseUrl: parsed.data.DATABASE_URL,
  openaiApiKey: parsed.data.OPENAI_API_KEY,
  googleBooksApiKey: parsed.data.GOOGLE_BOOKS_API_KEY,
  targetChatId: parseBigInt(parsed.data.TARGET_CHAT_ID),
  adminChatId: parseBigInt(parsed.data.ADMIN_CHAT_ID),
  adminUserIds: parseBigIntList(parsed.data.ADMIN_USER_IDS),
  reviewHashtag: "#рецензия",
  port: parseInt(parsed.data.PORT, 10),
  isDev: parsed.data.NODE_ENV === "development",
  isProd: parsed.data.NODE_ENV === "production",
};

export default config;
