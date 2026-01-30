import fs from "fs";
import path from "path";
import { config } from "../lib/config.js";
import { sendWarningNotification } from "./notification.service.js";

export interface OrphanedReviewCase {
  reviewText: string;
  extractedTitle: string | null;
  extractedAuthor: string | null;
  extractionConfidence: "high" | "medium" | "low" | null;
}

interface FailureRecord {
  timestamp: Date;
  error: unknown;
}

// Sliding window failure tracking (3 failures in 60 minutes → alert)
const recentFailures: FailureRecord[] = [];
const FAILURE_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const FAILURE_THRESHOLD = 3;
let alertSent = false;

/**
 * Main entry point - logs an orphaned review case to markdown file.
 * Fire-and-forget: never throws, always resolves.
 */
export async function logOrphanedReviewCase(
  reviewCase: OrphanedReviewCase,
  date: Date = new Date()
): Promise<void> {
  try {
    const filePath = getCurrentLogFilePath(date);
    const dirPath = path.dirname(filePath);

    // Lazy directory creation
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Get next case number
    const caseNumber = getNextCaseNumber(filePath);

    // Format case entry
    const entry = formatCaseEntry(caseNumber, reviewCase, date);

    // Append to file (create if doesn't exist)
    fs.appendFileSync(filePath, entry, "utf-8");

    console.log(`[EvalCase] Logged orphaned review case #${caseNumber} to ${filePath}`);
  } catch (error) {
    console.error("[EvalCase] Failed to log orphaned review case:", error);
    await trackFailure(error);
  }
}

/**
 * Returns the current log file path based on date and version.
 * Format: data/review-eval-cases/{version}/YYYY-MM.md
 */
export function getCurrentLogFilePath(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const filename = `${year}-${month}.md`;

  return path.join(
    process.cwd(),
    "data",
    "review-eval-cases",
    config.extractionVersion,
    filename
  );
}

/**
 * Gets the next case number by reading the file and finding the max case number.
 * Returns 1 if file doesn't exist or has no cases.
 */
export function getNextCaseNumber(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 1;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const caseNumberRegex = /^## Case #(\d+)/gm;
    let maxNumber = 0;

    let match;
    while ((match = caseNumberRegex.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }

    return maxNumber + 1;
  } catch (error) {
    console.error("[EvalCase] Error reading case numbers from file:", error);
    return 1;
  }
}

/**
 * Formats a case entry in markdown format.
 */
export function formatCaseEntry(
  caseNumber: number,
  reviewCase: OrphanedReviewCase,
  timestamp: Date = new Date()
): string {
  const dateStr = timestamp.toISOString().replace("T", " ").substring(0, 19);
  const isoStr = timestamp.toISOString();

  const titleLine = reviewCase.extractedTitle
    ? `"${reviewCase.extractedTitle}"`
    : "null";
  const authorLine = reviewCase.extractedAuthor
    ? `"${reviewCase.extractedAuthor}"`
    : "null";
  const confidenceLine = reviewCase.extractionConfidence || "null";

  return `## Case #${caseNumber} - ${dateStr}

**Review Text:**
\`\`\`
${reviewCase.reviewText}
\`\`\`

**Extraction Results:**
- **Title:** ${titleLine}
- **Author:** ${authorLine}
- **Confidence:** ${confidenceLine}

**Collected At:** ${isoStr}

---

`;
}

/**
 * Returns statistics about logged cases.
 */
export async function getLogStats(): Promise<{
  version: string;
  fileCount: number;
  totalCases: number;
}> {
  const version = config.extractionVersion;
  const dirPath = path.join(
    process.cwd(),
    "data",
    "review-eval-cases",
    version
  );

  if (!fs.existsSync(dirPath)) {
    return { version, fileCount: 0, totalCases: 0 };
  }

  try {
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    let totalCases = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const caseMatches = content.match(/^## Case #\d+/gm);
      if (caseMatches) {
        totalCases += caseMatches.length;
      }
    }

    return { version, fileCount: files.length, totalCases };
  } catch (error) {
    console.error("[EvalCase] Error getting log stats:", error);
    return { version, fileCount: 0, totalCases: 0 };
  }
}

/**
 * Tracks failures and sends alert if threshold is exceeded.
 */
async function trackFailure(error: unknown): Promise<void> {
  const now = new Date();

  // Add current failure
  recentFailures.push({ timestamp: now, error });

  // Remove failures outside the window
  const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const recentCount = recentFailures.filter(
    (f) => f.timestamp >= windowStart
  ).length;

  // Send alert if threshold exceeded and not already sent
  if (recentCount >= FAILURE_THRESHOLD && !alertSent) {
    alertSent = true;
    try {
      await sendWarningNotification(
        `Review evaluation case logging has failed ${recentCount} times in the last hour. ` +
          `Review processing continues normally, but eval cases are not being logged. ` +
          `Last error: ${error instanceof Error ? error.message : String(error)}`
      );
    } catch (notifError) {
      console.error("[EvalCase] Failed to send failure alert:", notifError);
    }
  }

  // Clean up old failures (keep only those in the window)
  while (
    recentFailures.length > 0 &&
    recentFailures[0].timestamp < windowStart
  ) {
    recentFailures.shift();
  }

  // Reset alert flag if failures have dropped below threshold
  if (recentCount < FAILURE_THRESHOLD) {
    alertSent = false;
  }
}
