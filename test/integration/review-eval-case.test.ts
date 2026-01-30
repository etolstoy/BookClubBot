import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  logOrphanedReviewCase,
  getCurrentLogFilePath,
  getNextCaseNumber,
  formatCaseEntry,
  getLogStats,
  type OrphanedReviewCase,
} from "../../src/services/review-eval-case-logger.service.js";

// Use test-specific version for isolation
const originalEnv = process.env.EXTRACTION_VERSION;

function getTestDir(version: string = "v1"): string {
  return path.join(process.cwd(), "data", "review-eval-cases", version);
}

function cleanAllTestDirs(): void {
  const baseDir = path.join(process.cwd(), "data", "review-eval-cases");
  if (fs.existsSync(baseDir)) {
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
      if (entry.startsWith("test-") || entry === "v1" || entry === "v2") {
        const entryPath = path.join(baseDir, entry);
        if (fs.statSync(entryPath).isDirectory()) {
          fs.rmSync(entryPath, { recursive: true });
        }
      }
    }
  }
}

describe.sequential("Review Eval Case Logger", () => {
  beforeAll(() => {
    cleanAllTestDirs();
  });

  afterAll(() => {
    cleanAllTestDirs();
    // Restore original if it existed
    if (originalEnv !== undefined) {
      process.env.EXTRACTION_VERSION = originalEnv;
    }
  });

  it("should create log file with correct format for orphaned review", async () => {
    const testCase: OrphanedReviewCase = {
      reviewText: "This is a great book about programming!",
      extractedTitle: "The Pragmatic Programmer",
      extractedAuthor: "Andy Hunt",
      extractionConfidence: "low",
    };

    const testDate = new Date("2026-01-15T14:32:18.000Z");
    await logOrphanedReviewCase(testCase, testDate);

    const filePath = getCurrentLogFilePath(testDate);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Case #1 - 2026-01-15 14:32:18");
    expect(content).toContain("**Review Text:**");
    expect(content).toContain("This is a great book about programming!");
    expect(content).toContain('**Title:** "The Pragmatic Programmer"');
    expect(content).toContain('**Author:** "Andy Hunt"');
    expect(content).toContain("**Confidence:** low");
    expect(content).toContain("**Collected At:** 2026-01-15T14:32:18.000Z");
    expect(content).toContain("---");
  });

  it("should handle null extraction values", async () => {
    const testCase: OrphanedReviewCase = {
      reviewText: "Some ambiguous review text",
      extractedTitle: null,
      extractedAuthor: null,
      extractionConfidence: null,
    };

    const testDate = new Date("2026-01-15T10:00:00.000Z");
    await logOrphanedReviewCase(testCase, testDate);

    const filePath = getCurrentLogFilePath(testDate);
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("**Title:** null");
    expect(content).toContain("**Author:** null");
    expect(content).toContain("**Confidence:** null");
  });

  it("should assign sequential case numbers to multiple reviews", async () => {
    const testDate = new Date("2026-01-15T12:00:00.000Z");

    const case1: OrphanedReviewCase = {
      reviewText: "First review",
      extractedTitle: "Book 1",
      extractedAuthor: "Author 1",
      extractionConfidence: "low",
    };

    const case2: OrphanedReviewCase = {
      reviewText: "Second review",
      extractedTitle: "Book 2",
      extractedAuthor: "Author 2",
      extractionConfidence: "medium",
    };

    const case3: OrphanedReviewCase = {
      reviewText: "Third review",
      extractedTitle: null,
      extractedAuthor: null,
      extractionConfidence: null,
    };

    await logOrphanedReviewCase(case1, testDate);
    await logOrphanedReviewCase(case2, testDate);
    await logOrphanedReviewCase(case3, testDate);

    const filePath = getCurrentLogFilePath(testDate);
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("## Case #1");
    expect(content).toContain("## Case #2");
    expect(content).toContain("## Case #3");
    expect(content).toContain("First review");
    expect(content).toContain("Second review");
    expect(content).toContain("Third review");
  });

  it("should create separate files for different months (monthly rotation)", async () => {
    const janDate = new Date("2026-01-15T12:00:00.000Z");
    const febDate = new Date("2026-02-10T12:00:00.000Z");

    const janCase: OrphanedReviewCase = {
      reviewText: "January review",
      extractedTitle: "Jan Book",
      extractedAuthor: "Jan Author",
      extractionConfidence: "low",
    };

    const febCase: OrphanedReviewCase = {
      reviewText: "February review",
      extractedTitle: "Feb Book",
      extractedAuthor: "Feb Author",
      extractionConfidence: "medium",
    };

    await logOrphanedReviewCase(janCase, janDate);
    await logOrphanedReviewCase(febCase, febDate);

    const janFilePath = getCurrentLogFilePath(janDate);
    const febFilePath = getCurrentLogFilePath(febDate);

    expect(janFilePath).toContain("2026-01.md");
    expect(febFilePath).toContain("2026-02.md");

    expect(fs.existsSync(janFilePath)).toBe(true);
    expect(fs.existsSync(febFilePath)).toBe(true);

    const janContent = fs.readFileSync(janFilePath, "utf-8");
    const febContent = fs.readFileSync(febFilePath, "utf-8");

    expect(janContent).toContain("January review");
    expect(janContent).not.toContain("February review");

    expect(febContent).toContain("February review");
    expect(febContent).not.toContain("January review");
  });

  it("should isolate cases by version subdirectories", async () => {
    // Note: This test verifies the version isolation concept by checking
    // that the service uses config.extractionVersion in path generation.
    // In the current test setup, config is already loaded with default "v1",
    // so we verify that the path generation function correctly includes the version.

    const testDate = new Date("2026-01-15T12:00:00.000Z");

    // Log a case with current config (should use v1)
    const testCase: OrphanedReviewCase = {
      reviewText: "Version isolation test",
      extractedTitle: "Test Book",
      extractedAuthor: "Test Author",
      extractionConfidence: "low",
    };
    await logOrphanedReviewCase(testCase, testDate);

    // Verify the file was created in the v1 directory
    const filePath = getCurrentLogFilePath(testDate);
    expect(filePath).toContain("/v1/2026-01.md");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Version isolation test");
  });

  it("should return correct stats from getLogStats", async () => {
    // Clean the v1 directory first to ensure predictable counts
    const v1Dir = getTestDir("v1");
    if (fs.existsSync(v1Dir)) {
      fs.rmSync(v1Dir, { recursive: true });
    }

    const testDate = new Date("2026-01-15T12:00:00.000Z");

    // Create 3 cases in January
    for (let i = 0; i < 3; i++) {
      await logOrphanedReviewCase(
        {
          reviewText: `Stats Review ${i + 1}`,
          extractedTitle: `Stats Book ${i + 1}`,
          extractedAuthor: `Stats Author ${i + 1}`,
          extractionConfidence: "low",
        },
        testDate
      );
    }

    // Create 2 cases in February
    const febDate = new Date("2026-02-10T12:00:00.000Z");
    for (let i = 0; i < 2; i++) {
      await logOrphanedReviewCase(
        {
          reviewText: `Stats Feb Review ${i + 1}`,
          extractedTitle: `Stats Feb Book ${i + 1}`,
          extractedAuthor: `Stats Feb Author ${i + 1}`,
          extractionConfidence: "medium",
        },
        febDate
      );
    }

    const stats = await getLogStats();
    expect(stats.version).toBe("v1"); // Default from config
    expect(stats.fileCount).toBe(2); // 2026-01.md and 2026-02.md
    expect(stats.totalCases).toBe(5); // 3 + 2
  });

  it("should send alert after threshold failures", async () => {
    // Mock sendWarningNotification
    const notificationModule = await import("../../src/services/notification.service.js");
    const notificationSpy = vi
      .spyOn(notificationModule, "sendWarningNotification")
      .mockResolvedValue(undefined);

    // Make directory read-only to trigger failures
    const testDir = getTestDir();
    fs.mkdirSync(testDir, { recursive: true });

    // Create a file and make it read-only
    const testDate = new Date("2026-01-15T12:00:00.000Z");
    const filePath = getCurrentLogFilePath(testDate);
    fs.writeFileSync(filePath, "initial content", "utf-8");
    fs.chmodSync(filePath, 0o444); // read-only

    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      await logOrphanedReviewCase(
        {
          reviewText: `Failing review ${i + 1}`,
          extractedTitle: "Book",
          extractedAuthor: "Author",
          extractionConfidence: "low",
        },
        testDate
      );
    }

    // Wait a bit for async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify notification was sent
    expect(notificationSpy).toHaveBeenCalledWith(
      expect.stringContaining("Review evaluation case logging has failed")
    );
    expect(notificationSpy).toHaveBeenCalledWith(
      expect.stringContaining("3 times in the last hour")
    );

    // Restore permissions and clean up
    fs.chmodSync(filePath, 0o644);
    notificationSpy.mockRestore();
  });

  it("should correctly get next case number from existing file", () => {
    const testDate = new Date("2026-01-15T12:00:00.000Z");
    const filePath = getCurrentLogFilePath(testDate);
    const dirPath = path.dirname(filePath);

    // Create directory
    fs.mkdirSync(dirPath, { recursive: true });

    // Create file with some existing cases
    const content = `## Case #1 - 2026-01-15 10:00:00

**Review Text:**
\`\`\`
First review
\`\`\`

---

## Case #5 - 2026-01-15 11:00:00

**Review Text:**
\`\`\`
Fifth review
\`\`\`

---

## Case #3 - 2026-01-15 10:30:00

**Review Text:**
\`\`\`
Third review
\`\`\`

---
`;

    fs.writeFileSync(filePath, content, "utf-8");

    // Should find max case number (5) and return 6
    const nextNumber = getNextCaseNumber(filePath);
    expect(nextNumber).toBe(6);
  });

  it("should format case entry correctly", () => {
    const testCase: OrphanedReviewCase = {
      reviewText: "Sample review text\nwith multiple lines",
      extractedTitle: "Sample Book",
      extractedAuthor: "Sample Author",
      extractionConfidence: "medium",
    };

    const testDate = new Date("2026-01-15T14:32:18.000Z");
    const entry = formatCaseEntry(42, testCase, testDate);

    expect(entry).toContain("## Case #42 - 2026-01-15 14:32:18");
    expect(entry).toContain("**Review Text:**");
    expect(entry).toContain("Sample review text\nwith multiple lines");
    expect(entry).toContain('**Title:** "Sample Book"');
    expect(entry).toContain('**Author:** "Sample Author"');
    expect(entry).toContain("**Confidence:** medium");
    expect(entry).toContain("**Collected At:** 2026-01-15T14:32:18.000Z");
    expect(entry).toContain("---");
  });
});
