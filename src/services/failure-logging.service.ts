/**
 * Google Books failure logging service
 * Logs extraction/enrichment failures to monthly-rotated JSON files
 */

import fs from "fs";
import path from "path";

export interface FailureLogEntry {
  timestamp: string; // ISO 8601 format
  title: string;
  author: string | null;
}

/**
 * Get log file path for a given date
 * Format: YYYY-MM.log (monthly rotation)
 *
 * @param logDir - Directory for log files
 * @param date - Date to determine log file (defaults to now)
 * @returns Full path to log file
 */
export function getLogPath(logDir: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const fileName = `${year}-${month}.log`;
  return path.join(logDir, fileName);
}

/**
 * Log a Google Books failure (no match found or API error)
 * Appends to monthly-rotated JSON log file
 *
 * @param logDir - Directory for log files
 * @param title - Extracted book title
 * @param author - Extracted author (can be null)
 * @param date - Date for log rotation (defaults to now, exposed for testing)
 */
export async function logGoogleBooksFailure(
  logDir: string,
  title: string,
  author: string | null,
  date: Date = new Date()
): Promise<void> {
  try {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Get log file path for current month
    const logPath = getLogPath(logDir, date);

    // Create log entry
    const entry: FailureLogEntry = {
      timestamp: date.toISOString(),
      title,
      author,
    };

    // Append as JSON line
    const jsonLine = JSON.stringify(entry) + "\n";
    fs.appendFileSync(logPath, jsonLine, "utf-8");
  } catch (error) {
    // Log to console if file writing fails (don't throw - non-blocking)
    console.error("Failed to write to Google Books failure log:", error);
  }
}
