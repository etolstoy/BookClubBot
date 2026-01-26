/**
 * Book Extraction Accuracy Tests
 *
 * This test suite runs an LLM client against a dataset of reviews
 * and measures extraction accuracy. Use this to refine prompts and
 * evaluate model performance.
 *
 * Run with: npm test -- test/integration/book-extraction-accuracy.test.ts
 *
 * Environment variables:
 *   OPENAI_API_KEY - Required for API access
 *   LLM_CLIENT - Optional: "openai" (default) or "cascading"
 *   ACCURACY_TEST_FILTER - Optional: filter tests by ID (exact match)
 *
 * Examples:
 *   npm test -- test/integration/book-extraction-accuracy.test.ts
 *   LLM_CLIENT=cascading npm test -- test/integration/book-extraction-accuracy.test.ts
 *   LLM_CLIENT=cascading npm run test:accuracy review-2
 */

import { describe, it, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { OpenAIClient } from "../../src/clients/llm/openai-client.js";
import { CascadingOpenAIClient, type PipelineMetrics } from "../../src/clients/llm/cascading-openai-client.js";
import type { ILLMClient, ExtractedBookInfo } from "../../src/lib/interfaces/index.js";

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load dataset from JSON file
const datasetPath = join(__dirname, "../fixtures/llm/book-extraction-dataset.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));

interface AlternativeBook {
  title: string;
  author: string | null;
}

interface IdealAnswer {
  title: string;
  author: string | null;
  alternative_books: AlternativeBook[];
}

interface DatasetEntry {
  id: string;
  description: string;
  review_text: string;
  command_params?: string;
  ideal_answer: IdealAnswer;
}

interface TestResult {
  id: string;
  description: string;
  passed: boolean;
  titleMatch: boolean;
  authorMatch: boolean;
  alternativeBooksMatch: boolean;
  expected: IdealAnswer;
  actual: ExtractedBookInfo | null;
  errors: string[];
}

/**
 * Normalize string for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeString(str: string | null | undefined): string {
  if (!str) return "";
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check if two strings are similar enough (case-insensitive, trimmed)
 * Returns true if strings match or one contains the other
 */
function stringsMatch(
  expected: string | null,
  actual: string | null
): boolean {
  const normExpected = normalizeString(expected);
  const normActual = normalizeString(actual);

  if (normExpected === normActual) return true;
  if (!normExpected || !normActual) return normExpected === normActual;

  return false;
}

/**
 * Check if alternative books match (order-independent)
 */
function alternativeBooksMatch(
  expected: AlternativeBook[],
  actual: Array<{ title: string; author: string | null }> | undefined
): boolean {
  const actualBooks = actual || [];

  if (expected.length === 0 && actualBooks.length === 0) return true;
  if (expected.length !== actualBooks.length) return false;

  // Check if all expected books are found in actual (order-independent)
  return expected.every((expectedBook) =>
    actualBooks.some(
      (actualBook) =>
        stringsMatch(expectedBook.title, actualBook.title) &&
        stringsMatch(expectedBook.author, actualBook.author)
    )
  );
}

/**
 * Evaluate a single test case
 */
function evaluateResult(
  entry: DatasetEntry,
  result: ExtractedBookInfo | null
): TestResult {
  const errors: string[] = [];

  if (!result) {
    return {
      id: entry.id,
      description: entry.description,
      passed: false,
      titleMatch: false,
      authorMatch: false,
      alternativeBooksMatch: false,
      expected: entry.ideal_answer,
      actual: null,
      errors: ["Extraction returned null"],
    };
  }

  const titleMatch = stringsMatch(entry.ideal_answer.title, result.title);
  const authorMatch = stringsMatch(entry.ideal_answer.author, result.author);
  const altBooksMatch = alternativeBooksMatch(
    entry.ideal_answer.alternative_books,
    result.alternativeBooks
  );

  if (!titleMatch) {
    errors.push(
      `Title mismatch: expected "${entry.ideal_answer.title}", got "${result.title}"`
    );
  }
  if (!authorMatch) {
    errors.push(
      `Author mismatch: expected "${entry.ideal_answer.author}", got "${result.author}"`
    );
  }
  if (!altBooksMatch) {
    errors.push(
      `Alternative books mismatch: expected ${JSON.stringify(entry.ideal_answer.alternative_books)}, got ${JSON.stringify(result.alternativeBooks)}`
    );
  }

  // A test passes if title AND author match (alternative books are optional for passing)
  const passed = titleMatch && authorMatch;

  return {
    id: entry.id,
    description: entry.description,
    passed,
    titleMatch,
    authorMatch,
    alternativeBooksMatch: altBooksMatch,
    expected: entry.ideal_answer,
    actual: result,
    errors,
  };
}

/**
 * Calculate accuracy metrics from test results
 */
function calculateMetrics(results: TestResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const titleMatches = results.filter((r) => r.titleMatch).length;
  const authorMatches = results.filter((r) => r.authorMatch).length;
  const altBooksMatches = results.filter((r) => r.alternativeBooksMatch).length;

  return {
    total,
    passed,
    failed: total - passed,
    accuracy: total > 0 ? passed / total : 0,
    titleAccuracy: total > 0 ? titleMatches / total : 0,
    authorAccuracy: total > 0 ? authorMatches / total : 0,
    alternativeBooksAccuracy: total > 0 ? altBooksMatches / total : 0,
  };
}

/**
 * Print a detailed report of test results
 */
function printReport(results: TestResult[], pipelineMetrics?: PipelineMetrics) {
  const metrics = calculateMetrics(results);

  console.log("\n" + "=".repeat(60));
  console.log("BOOK EXTRACTION ACCURACY REPORT");
  console.log("=".repeat(60));

  console.log(`\nOverall Results:`);
  console.log(`  Total tests:      ${metrics.total}`);
  console.log(`  Passed:           ${metrics.passed}`);
  console.log(`  Failed:           ${metrics.failed}`);
  console.log(`  Accuracy:         ${(metrics.accuracy * 100).toFixed(1)}%`);

  console.log(`\nBreakdown:`);
  console.log(`  Title accuracy:   ${(metrics.titleAccuracy * 100).toFixed(1)}%`);
  console.log(`  Author accuracy:  ${(metrics.authorAccuracy * 100).toFixed(1)}%`);
  console.log(
    `  Alt books accuracy: ${(metrics.alternativeBooksAccuracy * 100).toFixed(1)}%`
  );

  if (pipelineMetrics) {
    console.log(`\nPipeline Metrics:`);
    console.log(`  Web search fallbacks: ${pipelineMetrics.webSearchFallbacks}`);
    console.log(`  Total input tokens:   ${pipelineMetrics.totalInputTokens.toLocaleString()}`);
    console.log(`  Total output tokens:  ${pipelineMetrics.totalOutputTokens.toLocaleString()}`);
    console.log(`  Total tokens:         ${(pipelineMetrics.totalInputTokens + pipelineMetrics.totalOutputTokens).toLocaleString()}`);
  }

  const failedTests = results.filter((r) => !r.passed);
  if (failedTests.length > 0) {
    console.log(`\nFailed Tests:`);
    failedTests.forEach((result) => {
      console.log(`\n  [${result.id}] ${result.description}`);
      result.errors.forEach((err) => console.log(`    - ${err}`));
    });
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

// Determine which client to use
const clientType = process.env.LLM_CLIENT || "openai";
const clientName = clientType === "cascading" ? "CascadingOpenAIClient" : "OpenAIClient";

describe(`Book Extraction Accuracy (${clientName})`, () => {
  let client: ILLMClient;

  // Filter dataset if ACCURACY_TEST_FILTER env var is set
  const filter = process.env.ACCURACY_TEST_FILTER;
  const fullDataset = dataset as DatasetEntry[];
  const typedDataset = filter
    ? fullDataset.filter((entry) => entry.id === filter)
    : fullDataset;

  if (filter && typedDataset.length === 0) {
    throw new Error(`No test cases found matching filter: ${filter}`);
  }

  if (filter) {
    console.log(`\nRunning ${typedDataset.length} test(s) matching: ${filter}\n`);
  }

  console.log(`\nUsing client: ${clientName}\n`);

  beforeAll(() => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for accuracy tests"
      );
    }

    // Create the appropriate client based on LLM_CLIENT env var
    if (clientType === "cascading") {
      client = new CascadingOpenAIClient({ apiKey });
    } else {
      client = new OpenAIClient({ apiKey });
    }
  });

  it("evaluates all entries in parallel", async () => {
    // Fire all API requests concurrently
    const extractionPromises = typedDataset.map((entry) =>
      client.extractBookInfo(entry.review_text, entry.command_params)
    );

    const results = await Promise.all(extractionPromises);

    // Evaluate all results
    const testResults = typedDataset.map((entry, index) =>
      evaluateResult(entry, results[index])
    );

    // Get pipeline metrics if using cascading client
    const pipelineMetrics = client instanceof CascadingOpenAIClient 
      ? client.getMetrics() 
      : undefined;

    // Print the report
    printReport(testResults, pipelineMetrics);
  }, 600_000); // 10 minute timeout for long-running evals
});
