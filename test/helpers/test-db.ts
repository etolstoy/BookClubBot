/**
 * Test Database Helper
 * Sets up in-memory SQLite databases for testing
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../..");

let prismaInstance: PrismaClient | null = null;
let testDbPath: string | null = null;

/**
 * Setup a test database with fresh schema
 * Creates an in-memory SQLite database and applies schema
 * @returns Object with PrismaClient instance and database path
 */
export async function setupTestDatabase(): Promise<{ prisma: PrismaClient; dbPath: string }> {
  // Generate unique database name
  const dbName = `test-${randomBytes(8).toString("hex")}.db`;
  testDbPath = join(projectRoot, "data", dbName);

  // Ensure data directory exists
  const dataDir = join(projectRoot, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Set DATABASE_URL environment variable for Prisma
  process.env.DATABASE_URL = `file:${testDbPath}`;

  console.log(`[Test DB] Creating test database: ${dbName}`);

  // Push schema to test database (faster than migrations for tests)
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: `file:${testDbPath}`,
      },
    });
  } catch (error) {
    console.error("[Test DB] Failed to push schema:", error);
    throw error;
  }

  // Create Prisma client instance
  prismaInstance = new PrismaClient({
    datasources: {
      db: {
        url: `file:${testDbPath}`,
      },
    },
  });

  await prismaInstance.$connect();

  console.log("[Test DB] Test database ready");
  return { prisma: prismaInstance, dbPath: testDbPath };
}

/**
 * Cleanup test database and disconnect client
 * Deletes the test database file
 * @param prisma - Optional PrismaClient instance to disconnect (uses module-level instance if not provided)
 * @param dbPath - Optional database path to delete (uses module-level path if not provided)
 */
export async function teardownTestDatabase(prisma?: PrismaClient, dbPath?: string): Promise<void> {
  const clientToDisconnect = prisma || prismaInstance;
  const pathToDelete = dbPath || testDbPath;

  if (clientToDisconnect) {
    console.log("[Test DB] Disconnecting from test database");
    await clientToDisconnect.$disconnect();
    if (clientToDisconnect === prismaInstance) {
      prismaInstance = null;
    }
  }

  if (pathToDelete && existsSync(pathToDelete)) {
    console.log("[Test DB] Deleting test database file");
    try {
      unlinkSync(pathToDelete);
      // Also clean up journal files if they exist
      const journalPath = `${pathToDelete}-journal`;
      if (existsSync(journalPath)) {
        unlinkSync(journalPath);
      }
    } catch (error) {
      console.warn("[Test DB] Failed to delete test database:", error);
    }
  }

  if (pathToDelete === testDbPath) {
    testDbPath = null;
  }
}

/**
 * @deprecated Use teardownTestDatabase instead
 */
export async function cleanupTestDatabase(): Promise<void> {
  return teardownTestDatabase();
}

/**
 * Clear all data from test database tables
 * Useful for resetting state between tests
 * @param prisma - PrismaClient instance
 */
export async function clearTestData(prisma: PrismaClient): Promise<void> {
  console.log("[Test DB] Clearing all test data");

  // Delete in correct order (respect foreign keys)
  await prisma.review.deleteMany({});
  await prisma.book.deleteMany({});
  // Add other tables as needed

  console.log("[Test DB] Test data cleared");
}

/**
 * Seed test database with initial data
 * @param prisma - PrismaClient instance
 * @param data - Data to seed
 */
export async function seedTestData(
  prisma: PrismaClient,
  data: {
    books?: Array<{
      title: string;
      author: string | null;
      isbn?: string | null;
      googleBooksId?: string | null;
      coverUrl?: string | null;
      description?: string | null;
      publicationYear?: number | null;
      pageCount?: number | null;
      genres?: string[];
    }>;
    reviews?: Array<{
      telegramUserId: bigint;
      bookId: number;
      reviewText: string;
      sentiment?: string | null;
      messageId: bigint;
    }>;
  }
): Promise<void> {
  console.log("[Test DB] Seeding test data");

  // Seed books
  if (data.books) {
    for (const book of data.books) {
      await prisma.book.create({
        data: {
          title: book.title,
          author: book.author || null,
          isbn: book.isbn || null,
          googleBooksId: book.googleBooksId || null,
          coverUrl: book.coverUrl || null,
          description: book.description || null,
          publicationYear: book.publicationYear || null,
          pageCount: book.pageCount || null,
          genres: book.genres ? JSON.stringify(book.genres) : null, // Convert array to JSON string for SQLite
        },
      });
    }
    console.log(`[Test DB] Seeded ${data.books.length} books`);
  }

  // Seed reviews
  if (data.reviews) {
    for (const review of data.reviews) {
      await prisma.review.create({
        data: {
          telegramUserId: review.telegramUserId,
          bookId: review.bookId,
          reviewText: review.reviewText,
          sentiment: review.sentiment || null,
          messageId: review.messageId,
        },
      });
    }
    console.log(`[Test DB] Seeded ${data.reviews.length} reviews`);
  }
}

/**
 * Get the current test database Prisma client instance
 * @returns Current PrismaClient or null if not set up
 */
export function getTestDatabase(): PrismaClient | null {
  return prismaInstance;
}
