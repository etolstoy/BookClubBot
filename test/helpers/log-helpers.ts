/**
 * Test helpers for failure logging
 */

import fs from "fs";
import path from "path";

export interface LogEntry {
  timestamp: string;
  title: string;
  author: string | null;
}

/**
 * Setup temporary log directory for testing
 */
export function setupTestLogDir(testDir: string): void {
  if (fs.existsSync(testDir)) {
    // Clean existing test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
}

/**
 * Cleanup test log directory
 */
export function cleanupTestLogDir(testDir: string): void {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

/**
 * Read and parse JSON lines from log file
 */
export function readLogFile(logPath: string): LogEntry[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content
    .split("\n")
    .filter((line) => line.trim().length > 0);

  return lines.map((line) => JSON.parse(line));
}

/**
 * Assert log entry has correct structure
 */
export function assertLogEntry(
  entry: LogEntry,
  expectedTitle: string,
  expectedAuthor: string | null
) {
  if (!entry.timestamp) {
    throw new Error("Log entry missing timestamp");
  }

  if (typeof entry.timestamp !== "string") {
    throw new Error(
      `Log entry timestamp must be string, got ${typeof entry.timestamp}`
    );
  }

  // Validate ISO 8601 format
  const timestamp = new Date(entry.timestamp);
  if (isNaN(timestamp.getTime())) {
    throw new Error(`Invalid timestamp format: ${entry.timestamp}`);
  }

  if (entry.title !== expectedTitle) {
    throw new Error(
      `Expected title "${expectedTitle}", got "${entry.title}"`
    );
  }

  if (entry.author !== expectedAuthor) {
    throw new Error(
      `Expected author "${expectedAuthor}", got "${entry.author}"`
    );
  }
}

/**
 * Assert log file exists and has correct format
 */
export function assertLogFileExists(logPath: string) {
  if (!fs.existsSync(logPath)) {
    throw new Error(`Log file does not exist: ${logPath}`);
  }

  const stat = fs.statSync(logPath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${logPath}`);
  }
}

/**
 * Get all log files in directory
 */
export function getLogFiles(logDir: string): string[] {
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((file) => file.endsWith(".log"))
    .map((file) => path.join(logDir, file));
}

/**
 * Assert monthly log file naming convention (YYYY-MM.log)
 */
export function assertMonthlyLogFileName(fileName: string) {
  const monthlyPattern = /^\d{4}-\d{2}\.log$/;
  const baseName = path.basename(fileName);

  if (!monthlyPattern.test(baseName)) {
    throw new Error(
      `Log file name must match YYYY-MM.log format, got: ${baseName}`
    );
  }
}

/**
 * Get expected log file path for a given date
 */
export function getExpectedLogPath(logDir: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return path.join(logDir, `${year}-${month}.log`);
}
