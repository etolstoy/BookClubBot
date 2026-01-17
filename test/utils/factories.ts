/**
 * Test Data Factories
 *
 * Provides factories for generating realistic test data
 * Uses @faker-js/faker for randomization
 */

import { faker } from '@faker-js/faker';
import type { Book, Review } from '@prisma/client';

/**
 * Book factory
 */
export class BookFactory {
  static create(overrides?: Partial<Book>): Omit<Book, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      title: faker.lorem.words(3),
      author: faker.person.fullName(),
      googleBooksId: faker.string.alphanumeric(12),
      coverUrl: faker.image.url(),
      genres: JSON.stringify([faker.book.genre(), faker.book.genre()]),
      publicationYear: faker.date.past({ years: 100 }).getFullYear(),
      description: faker.lorem.paragraph(),
      isbn: faker.string.numeric(13),
      pageCount: faker.number.int({ min: 100, max: 1000 }),
      goodreadsUrl: null, // Computed dynamically
      ...overrides,
    };
  }

  static createMany(count: number, overrides?: Partial<Book>): Array<Omit<Book, 'id' | 'createdAt' | 'updatedAt'>> {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  static createGatsby(): Omit<Book, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      googleBooksId: 'test_gatsby_123',
      coverUrl: 'https://example.com/gatsby.jpg',
      genres: JSON.stringify(['Fiction', 'Classics']),
      publicationYear: 1925,
      description: 'A classic American novel',
      isbn: '9780743273565',
      pageCount: 180,
      goodreadsUrl: null,
    };
  }

  static createWarAndPeace(): Omit<Book, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      title: 'Война и мир',
      author: 'Лев Толстой',
      googleBooksId: 'test_war_peace_123',
      coverUrl: 'https://example.com/war-peace.jpg',
      genres: JSON.stringify(['Fiction', 'Historical']),
      publicationYear: 1869,
      description: 'Эпический роман',
      isbn: '9785170882540',
      pageCount: 1225,
      goodreadsUrl: null,
    };
  }
}

/**
 * Review factory
 */
export class ReviewFactory {
  static create(overrides?: Partial<Review>): Omit<Review, 'id' | 'createdAt'> {
    return {
      bookId: faker.number.int({ min: 1, max: 100 }),
      telegramUserId: BigInt(faker.number.int({ min: 100000000, max: 999999999 })),
      telegramUsername: faker.internet.userName(),
      telegramDisplayName: faker.person.fullName(),
      reviewText: faker.lorem.paragraph(),
      sentiment: faker.helpers.arrayElement(['positive', 'negative', 'neutral']),
      messageId: BigInt(faker.number.int({ min: 1000, max: 999999 })),
      chatId: BigInt(faker.number.int({ min: -1002000000000, max: -1001000000000 })),
      reviewedAt: faker.date.recent({ days: 30 }),
      ...overrides,
    };
  }

  static createMany(count: number, overrides?: Partial<Review>): Array<Omit<Review, 'id' | 'createdAt'>> {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  static createPositive(overrides?: Partial<Review>): Omit<Review, 'id' | 'createdAt'> {
    return this.create({
      sentiment: 'positive',
      reviewText: 'Amazing book! Highly recommend it to everyone. One of the best books I have ever read.',
      ...overrides,
    });
  }

  static createNegative(overrides?: Partial<Review>): Omit<Review, 'id' | 'createdAt'> {
    return this.create({
      sentiment: 'negative',
      reviewText: 'Disappointing read. Did not enjoy it at all. Would not recommend.',
      ...overrides,
    });
  }

  static createNeutral(overrides?: Partial<Review>): Omit<Review, 'id' | 'createdAt'> {
    return this.create({
      sentiment: 'neutral',
      reviewText: 'Decent book. Has its moments but nothing special. Average overall.',
      ...overrides,
    });
  }
}

/**
 * Telegram message factory
 */
export class TelegramMessageFactory {
  static createMessage(overrides?: any) {
    return {
      message_id: faker.number.int({ min: 1000, max: 999999 }),
      chat: {
        id: BigInt(-1001234567890),
        type: 'group' as const,
        title: faker.company.name(),
      },
      from: {
        id: faker.number.int({ min: 100000000, max: 999999999 }),
        username: faker.internet.userName(),
        first_name: faker.person.firstName(),
        last_name: faker.person.lastName(),
        is_bot: false,
      },
      date: Math.floor(Date.now() / 1000),
      text: faker.lorem.paragraph(),
      ...overrides,
    };
  }

  static createReviewMessage(bookTitle: string, author: string, overrides?: any) {
    return this.createMessage({
      text: `Just finished reading "${bookTitle}" by ${author}. Amazing book! #рецензия`,
      ...overrides,
    });
  }

  static createReviewMessageRussian(bookTitle: string, author: string, overrides?: any) {
    return this.createMessage({
      text: `Прочитал "${bookTitle}" от ${author}. Отличная книга! #рецензия`,
      ...overrides,
    });
  }
}
