/**
 * Test Database Utility
 *
 * Provides in-memory SQLite database for testing
 * Each test gets a fresh database instance
 */

import { PrismaClient } from '@prisma/client';
import { beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let prisma: PrismaClient | null = null;

/**
 * Sets up a test database with migrations applied
 * Call this in your test files to get database access
 *
 * @example
 * ```typescript
 * import { setupTestDatabase } from '@test/utils/test-db';
 *
 * describe('My Test Suite', () => {
 *   const getPrisma = setupTestDatabase();
 *
 *   it('should do something', async () => {
 *     const db = getPrisma();
 *     // use db...
 *   });
 * });
 * ```
 */
export function setupTestDatabase() {
  beforeEach(async () => {
    // Create new Prisma client with in-memory database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file::memory:?cache=shared',
        },
      },
      log: process.env.DEBUG_TESTS ? ['query', 'error', 'warn'] : ['error'],
    });

    // Connect to database
    await prisma.$connect();

    // Apply migrations/schema
    // Note: We use `prisma db push` for in-memory databases
    // since migrations don't work well with in-memory SQLite
    try {
      await execAsync('npx prisma db push --skip-generate', {
        env: {
          ...process.env,
          DATABASE_URL: 'file::memory:?cache=shared',
        },
      });
    } catch (error) {
      console.error('Failed to push database schema:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (prisma) {
      // Clean up all tables
      const tablenames = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations';
      `;

      for (const { name } of tablenames) {
        await prisma.$executeRawUnsafe(`DELETE FROM ${name};`);
      }

      await prisma.$disconnect();
      prisma = null;
    }
  });

  // Return function that provides access to prisma instance
  return () => {
    if (!prisma) {
      throw new Error('Prisma client not initialized. Did you call this outside a test?');
    }
    return prisma;
  };
}

/**
 * Seed database with test data
 */
export async function seedTestData(db: PrismaClient) {
  // Create sample books
  const book1 = await db.book.create({
    data: {
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      isbn: '9780743273565',
      publicationYear: 1925,
      googleBooksId: 'test_ggb_id_1',
      coverUrl: 'https://example.com/cover1.jpg',
    },
  });

  const book2 = await db.book.create({
    data: {
      title: 'Война и мир',
      author: 'Лев Толстой',
      isbn: '9785170882540',
      publicationYear: 1869,
      googleBooksId: 'test_ggb_id_2',
      coverUrl: 'https://example.com/cover2.jpg',
    },
  });

  // Create sample reviews
  await db.review.createMany({
    data: [
      {
        bookId: book1.id,
        telegramUserId: BigInt(123456789),
        telegramUsername: 'testuser1',
        telegramDisplayName: 'Test User 1',
        reviewText: 'Amazing book! Highly recommend.',
        sentiment: 'positive',
        messageId: BigInt(1001),
        chatId: BigInt(-1001234567890),
        reviewedAt: new Date('2025-01-01'),
      },
      {
        bookId: book2.id,
        telegramUserId: BigInt(987654321),
        telegramUsername: 'testuser2',
        telegramDisplayName: 'Test User 2',
        reviewText: 'Невероятная книга! Обязательно к прочтению.',
        sentiment: 'positive',
        messageId: BigInt(1002),
        chatId: BigInt(-1001234567890),
        reviewedAt: new Date('2025-01-02'),
      },
    ],
  });

  return { book1, book2 };
}
