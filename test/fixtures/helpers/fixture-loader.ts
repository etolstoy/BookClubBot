/**
 * Fixture Loader
 * Utilities for loading JSON test fixtures with type safety
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  ExtractedBookInfo,
  Sentiment,
  BookSearchResult,
} from "../../../src/lib/interfaces/index.js";

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Review fixture structure
 */
export interface ReviewFixture {
  reviewText: string;
  expectedExtraction: ExtractedBookInfo;
  expectedSentiment: Sentiment;
  expectedBookMatch?: {
    googleBooksId: string;
    title: string;
    author: string;
  };
}

/**
 * Book fixture structure (extends BookSearchResult)
 */
export interface BookFixture extends BookSearchResult {}

/**
 * Load a single review fixture by name
 * @param name - Fixture name without extension (e.g., "positive-gatsby")
 * @returns Parsed review fixture
 */
export function loadReviewFixture(name: string): ReviewFixture {
  const path = join(__dirname, "../reviews", `${name}.json`);
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as ReviewFixture;
}

/**
 * Load a single book fixture by name
 * @param name - Fixture name without extension (e.g., "great-gatsby")
 * @returns Parsed book fixture
 */
export function loadBookFixture(name: string): BookFixture {
  const path = join(__dirname, "../books", `${name}.json`);
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as BookFixture;
}

/**
 * Load all review fixtures from the reviews directory
 * @returns Map of fixture name to fixture data
 */
export function loadAllReviewFixtures(): Map<string, ReviewFixture> {
  const fixtures = new Map<string, ReviewFixture>();
  const reviewsDir = join(__dirname, "../reviews");

  try {
    const files = readdirSync(reviewsDir);
    files
      .filter((file) => file.endsWith(".json"))
      .forEach((file) => {
        const name = file.replace(".json", "");
        fixtures.set(name, loadReviewFixture(name));
      });
  } catch (error) {
    console.warn("Could not load review fixtures:", error);
  }

  return fixtures;
}

/**
 * Load all book fixtures from the books directory
 * @returns Map of fixture name to fixture data
 */
export function loadAllBookFixtures(): Map<string, BookFixture> {
  const fixtures = new Map<string, BookFixture>();
  const booksDir = join(__dirname, "../books");

  try {
    const files = readdirSync(booksDir);
    files
      .filter((file) => file.endsWith(".json"))
      .forEach((file) => {
        const name = file.replace(".json", "");
        fixtures.set(name, loadBookFixture(name));
      });
  } catch (error) {
    console.warn("Could not load book fixtures:", error);
  }

  return fixtures;
}

/**
 * Get all book fixtures as an array
 * @returns Array of book fixtures
 */
export function getAllBookFixtures(): BookFixture[] {
  return Array.from(loadAllBookFixtures().values());
}

/**
 * Get all review fixtures as an array
 * @returns Array of review fixtures
 */
export function getAllReviewFixtures(): ReviewFixture[] {
  return Array.from(loadAllReviewFixtures().values());
}
