/**
 * Custom Test Assertions
 * Reusable assertion helpers for BookClubBot tests
 */

import { expect } from "vitest";
import type {
  ExtractedBookInfo,
  Sentiment,
  BookSearchResult,
} from "../../src/lib/interfaces/index.js";
import type { EnrichedBook } from "../../src/bot/types/confirmation-state.js";

/**
 * Assert that extracted book info matches expected values
 */
export function assertBookInfoMatches(
  actual: ExtractedBookInfo | null,
  expected: ExtractedBookInfo
): void {
  expect(actual, "Book info should not be null").not.toBeNull();
  expect(actual!.title, "Title should match").toBe(expected.title);
  expect(actual!.author, "Author should match").toBe(expected.author);
  expect(actual!.confidence, "Confidence level should match").toBe(
    expected.confidence
  );

  const expectedAltCount = expected.alternativeBooks?.length || 0;
  const actualAltCount = actual!.alternativeBooks?.length || 0;
  expect(actualAltCount, "Alternative books count should match").toBe(
    expectedAltCount
  );

  if (expected.alternativeBooks && actual!.alternativeBooks) {
    expected.alternativeBooks.forEach((expectedAlt, index) => {
      const actualAlt = actual!.alternativeBooks![index];
      expect(actualAlt.title, `Alternative book ${index} title should match`).toBe(
        expectedAlt.title
      );
      expect(actualAlt.author, `Alternative book ${index} author should match`).toBe(
        expectedAlt.author
      );
    });
  }
}

/**
 * Assert that sentiment matches expected value
 */
export function assertSentimentMatches(
  actual: Sentiment | null,
  expected: Sentiment | null
): void {
  if (expected === null) {
    expect(actual, "Sentiment should be null").toBeNull();
  } else {
    expect(actual, "Sentiment should not be null").not.toBeNull();
    expect(actual, "Sentiment should match").toBe(expected);
  }
}

/**
 * Assert that book search result matches expected values
 */
export function assertBookResultMatches(
  actual: BookSearchResult | null,
  expected: Partial<BookSearchResult>
): void {
  expect(actual, "Book result should not be null").not.toBeNull();

  if (expected.googleBooksId) {
    expect(actual!.googleBooksId, "Google Books ID should match").toBe(
      expected.googleBooksId
    );
  }

  if (expected.title) {
    expect(actual!.title, "Title should match").toBe(expected.title);
  }

  if (expected.author !== undefined) {
    expect(actual!.author, "Author should match").toBe(expected.author);
  }

  if (expected.isbn !== undefined) {
    expect(actual!.isbn, "ISBN should match").toBe(expected.isbn);
  }
}

/**
 * Assert that similarity score is within expected range
 */
export function assertSimilarityScore(
  score: number,
  min: number,
  max: number = 1.0
): void {
  expect(score, `Similarity score should be >= ${min}`).toBeGreaterThanOrEqual(min);
  expect(score, `Similarity score should be <= ${max}`).toBeLessThanOrEqual(max);
}

/**
 * Assert that state transition is valid
 */
export function assertStateTransition(
  fromState: string,
  toState: string,
  validTransitions: Record<string, string[]>
): void {
  expect(
    validTransitions[fromState],
    `State ${fromState} should have valid transitions`
  ).toBeDefined();

  expect(
    validTransitions[fromState],
    `Transition from ${fromState} to ${toState} should be valid`
  ).toContain(toState);
}

/**
 * Assert that enriched book has required fields
 */
export function assertEnrichedBookValid(book: EnrichedBook): void {
  expect(book.title, "Enriched book should have title").toBeDefined();
  expect(book.title.length, "Title should not be empty").toBeGreaterThan(0);

  expect(book.similarity, "Enriched book should have similarity scores").toBeDefined();
  expect(book.similarity.title, "Title similarity should be defined").toBeDefined();
  assertSimilarityScore(book.similarity.title, 0, 1.0);

  expect(book.source, "Enriched book should have source").toBeDefined();
  expect(["local", "google"], "Source should be local or google").toContain(
    book.source
  );
}

/**
 * Assert that array contains items matching predicate
 */
export function assertArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message: string = "Array should contain matching item"
): void {
  const found = array.some(predicate);
  expect(found, message).toBe(true);
}

/**
 * Assert that two arrays have the same items (order-independent)
 */
export function assertArraysEqual<T>(
  actual: T[],
  expected: T[],
  compareFn?: (a: T, b: T) => boolean
): void {
  expect(actual.length, "Arrays should have same length").toBe(expected.length);

  const compare = compareFn || ((a: T, b: T) => a === b);

  expected.forEach((expectedItem) => {
    const found = actual.some((actualItem) => compare(actualItem, expectedItem));
    expect(found, `Array should contain item: ${JSON.stringify(expectedItem)}`).toBe(
      true
    );
  });
}

/**
 * Assert that a BigInt matches expected value
 * Helper for Telegram ID comparisons
 */
export function assertBigIntEquals(
  actual: bigint | undefined | null,
  expected: bigint | undefined | null
): void {
  if (expected === undefined || expected === null) {
    expect(actual, "BigInt should be null/undefined").toBe(expected);
  } else {
    expect(actual, "BigInt should be defined").toBeDefined();
    expect(actual, "BigInt values should match").toBe(expected);
  }
}

/**
 * Assert that error is thrown with expected message pattern
 */
export async function assertThrowsAsync(
  fn: () => Promise<unknown>,
  errorPattern: string | RegExp
): Promise<void> {
  let error: Error | null = null;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  expect(error, "Function should throw an error").not.toBeNull();

  if (typeof errorPattern === "string") {
    expect(error!.message, "Error message should contain pattern").toContain(
      errorPattern
    );
  } else {
    expect(error!.message, "Error message should match pattern").toMatch(
      errorPattern
    );
  }
}
