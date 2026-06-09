/**
 * Review Splitting Accuracy Tests
 *
 * Runs the LLM review-structure classifier against concatenated review examples.
 *
 * Environment variables:
 *   OPENAI_API_KEY - Required for API access (test skipped if not set)
 *   RUN_REVIEW_SPLITTING_ACCURACY=1 - Required to run live accuracy tests
 *   SPLITTING_TEST_FILTER - Optional: filter tests by ID (exact match)
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CascadingOpenAIClient } from "../../src/clients/llm/cascading-openai-client.js";
import { splitReviewText } from "../../src/services/review-splitting.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const datasetPath = join(__dirname, "../fixtures/llm/review-splitting-dataset.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf-8"));

interface DatasetEntry {
  id: string;
  description: string;
  review_text: string;
  ideal_answer: {
    kind: "single" | "concatenated";
    parts: string[];
  };
}

interface TestResult {
  id: string;
  description: string;
  passed: boolean;
  expectedParts: number;
  actualParts: number;
  elapsedMs: number;
}

function printReport(results: TestResult[]) {
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log("\n" + "=".repeat(60));
  console.log("REVIEW SPLITTING ACCURACY REPORT");
  console.log("=".repeat(60));
  console.log(`\nOverall Results:`);
  console.log(`  Total tests:      ${results.length}`);
  console.log(`  Passed:           ${passed}`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  Accuracy:         ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log(
    `  Total duration:   ${results.reduce((sum, result) => sum + result.elapsedMs, 0)}ms`
  );

  const failedTests = results.filter((result) => !result.passed);
  if (failedTests.length > 0) {
    console.log(`\nFailed Tests:`);
    for (const result of failedTests) {
      console.log(
        `\n  [${result.id}] ${result.description}\n` +
          `    - Expected parts: ${result.expectedParts}, actual parts: ${result.actualParts}`
      );
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

describe("Review Splitting Accuracy (CascadingOpenAIClient)", () => {
  let client: CascadingOpenAIClient;
  const shouldRunLiveAccuracy = process.env.RUN_REVIEW_SPLITTING_ACCURACY === "1";
  const hasApiKey = !!process.env.OPENAI_API_KEY?.startsWith("sk-");
  const filter = process.env.SPLITTING_TEST_FILTER;
  const fullDataset = dataset as DatasetEntry[];
  const typedDataset = filter
    ? fullDataset.filter((entry) => entry.id === filter)
    : fullDataset;

  if (filter && typedDataset.length === 0) {
    throw new Error(`No splitting test cases found matching filter: ${filter}`);
  }

  beforeEach(() => {
    if (!shouldRunLiveAccuracy) {
      console.log(
        "Skipping review splitting accuracy tests - RUN_REVIEW_SPLITTING_ACCURACY=1 not set\n"
      );
    } else if (!hasApiKey) {
      console.log("Skipping review splitting accuracy tests - OPENAI_API_KEY not set\n");
    }
  });

  beforeAll(() => {
    if (shouldRunLiveAccuracy && hasApiKey) {
      client = new CascadingOpenAIClient({ apiKey: process.env.OPENAI_API_KEY! });
    }
  });

  it.skipIf(!shouldRunLiveAccuracy || !hasApiKey)("evaluates all entries", async () => {
    const results: TestResult[] = [];

    for (const entry of typedDataset) {
      const start = Date.now();
      console.log(
        `[Review Splitting Accuracy] Running ${entry.id}: ` +
          `${entry.review_text.length} chars, expected ${entry.ideal_answer.parts.length} parts`
      );
      const actualParts = await splitReviewText(entry.review_text, client);
      const elapsedMs = Date.now() - start;
      const expectedParts = entry.ideal_answer.parts;
      const passed =
        actualParts.length === expectedParts.length &&
        actualParts.every((part, index) => part === expectedParts[index]);
      console.log(
        `[Review Splitting Accuracy] Finished ${entry.id}: ` +
          `${actualParts.length} parts in ${elapsedMs}ms (${passed ? "pass" : "fail"})`
      );

      results.push({
        id: entry.id,
        description: entry.description,
        passed,
        expectedParts: expectedParts.length,
        actualParts: actualParts.length,
        elapsedMs,
      });
    }

    printReport(results);
    expect(results.every((result) => result.passed)).toBe(true);
  }, 600_000);
});
