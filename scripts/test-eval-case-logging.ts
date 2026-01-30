/**
 * Manual test script for review evaluation case logging
 *
 * Usage: npx tsx scripts/test-eval-case-logging.ts
 */

import { logOrphanedReviewCase, getLogStats } from "../src/services/review-eval-case-logger.service.js";

async function main() {
  console.log("Testing review evaluation case logging...\n");

  // Test case 1: Low confidence extraction
  console.log("1. Logging case with low confidence extraction...");
  await logOrphanedReviewCase({
    reviewText: "This is a great book about programming! I loved how the author explained complex concepts.",
    extractedTitle: "The Pragmatic Programmer",
    extractedAuthor: "Andy Hunt",
    extractionConfidence: "low",
  });

  // Test case 2: Null extraction
  console.log("2. Logging case with null extraction...");
  await logOrphanedReviewCase({
    reviewText: "Fascinating read about artificial intelligence and its implications for society.",
    extractedTitle: null,
    extractedAuthor: null,
    extractionConfidence: null,
  });

  // Test case 3: Medium confidence extraction
  console.log("3. Logging case with medium confidence extraction...");
  await logOrphanedReviewCase({
    reviewText: "Incredible detective story with twists I never saw coming.",
    extractedTitle: "Murder on the Orient Express",
    extractedAuthor: null,
    extractionConfidence: "medium",
  });

  // Wait a bit for async operations
  await new Promise(resolve => setTimeout(resolve, 100));

  // Get statistics
  console.log("\n4. Getting statistics...");
  const stats = await getLogStats();
  console.log(`   Version: ${stats.version}`);
  console.log(`   Files: ${stats.fileCount}`);
  console.log(`   Total cases: ${stats.totalCases}`);

  console.log("\n✅ Test completed successfully!");
  console.log(`\nCheck the log files at: data/review-eval-cases/${stats.version}/`);
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
