/**
 * Unit tests for failure logging service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import {
  logGoogleBooksFailure,
  getLogPath,
} from "../../src/services/failure-logging.service.js";
import {
  setupTestLogDir,
  cleanupTestLogDir,
  readLogFile,
  assertLogEntry,
  assertLogFileExists,
  assertMonthlyLogFileName,
  getExpectedLogPath,
} from "../helpers/log-helpers.js";

const TEST_LOG_DIR = path.join(process.cwd(), "test-logs-temp");

describe("Failure Logging Service", () => {
  beforeEach(() => {
    setupTestLogDir(TEST_LOG_DIR);
  });

  afterEach(() => {
    cleanupTestLogDir(TEST_LOG_DIR);
  });

  describe("getLogPath", () => {
    it("should generate correct monthly log path (YYYY-MM.log)", () => {
      const date = new Date("2024-03-15");
      const logPath = getLogPath(TEST_LOG_DIR, date);

      expect(logPath).toContain("2024-03.log");
      assertMonthlyLogFileName(logPath);
    });

    it("should pad month with zero for single digits", () => {
      const date = new Date("2024-01-15");
      const logPath = getLogPath(TEST_LOG_DIR, date);

      expect(logPath).toContain("2024-01.log");
    });

    it("should handle December correctly", () => {
      const date = new Date("2024-12-31");
      const logPath = getLogPath(TEST_LOG_DIR, date);

      expect(logPath).toContain("2024-12.log");
    });
  });

  describe("logGoogleBooksFailure", () => {
    it("should create log file if it doesn't exist", async () => {
      await logGoogleBooksFailure(
        TEST_LOG_DIR,
        "Test Book",
        "Test Author"
      );

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      assertLogFileExists(logPath);
    });

    it("should log failure with correct structure", async () => {
      await logGoogleBooksFailure(
        TEST_LOG_DIR,
        "1984",
        "George Orwell"
      );

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      expect(entries).toHaveLength(1);
      assertLogEntry(entries[0], "1984", "George Orwell");
    });

    it("should handle null author", async () => {
      await logGoogleBooksFailure(
        TEST_LOG_DIR,
        "Unknown Book",
        null
      );

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      expect(entries).toHaveLength(1);
      assertLogEntry(entries[0], "Unknown Book", null);
    });

    it("should append to existing log file", async () => {
      await logGoogleBooksFailure(TEST_LOG_DIR, "Book 1", "Author 1");
      await logGoogleBooksFailure(TEST_LOG_DIR, "Book 2", "Author 2");
      await logGoogleBooksFailure(TEST_LOG_DIR, "Book 3", "Author 3");

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      expect(entries).toHaveLength(3);
      assertLogEntry(entries[0], "Book 1", "Author 1");
      assertLogEntry(entries[1], "Book 2", "Author 2");
      assertLogEntry(entries[2], "Book 3", "Author 3");
    });

    it("should use append-only JSON lines format", async () => {
      await logGoogleBooksFailure(TEST_LOG_DIR, "Test", "Author");

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      // Each entry should be valid JSON with timestamp, title, author
      expect(entries[0]).toHaveProperty("timestamp");
      expect(entries[0]).toHaveProperty("title");
      expect(entries[0]).toHaveProperty("author");
      expect(entries[0].title).toBe("Test");
      expect(entries[0].author).toBe("Author");
    });

    it("should create log directory if it doesn't exist", async () => {
      const nestedDir = path.join(TEST_LOG_DIR, "nested", "deep");
      cleanupTestLogDir(nestedDir); // Ensure it doesn't exist

      await logGoogleBooksFailure(nestedDir, "Book", "Author");

      const logPath = getExpectedLogPath(nestedDir, new Date());
      assertLogFileExists(logPath);
    });

    it("should rotate logs by month", async () => {
      // Log for March 2024
      const marchDate = new Date("2024-03-15");
      await logGoogleBooksFailure(
        TEST_LOG_DIR,
        "March Book",
        "March Author",
        marchDate
      );

      // Log for April 2024
      const aprilDate = new Date("2024-04-20");
      await logGoogleBooksFailure(
        TEST_LOG_DIR,
        "April Book",
        "April Author",
        aprilDate
      );

      // Should create two separate log files
      const marchLog = getExpectedLogPath(TEST_LOG_DIR, marchDate);
      const aprilLog = getExpectedLogPath(TEST_LOG_DIR, aprilDate);

      assertLogFileExists(marchLog);
      assertLogFileExists(aprilLog);

      const marchEntries = readLogFile(marchLog);
      const aprilEntries = readLogFile(aprilLog);

      expect(marchEntries).toHaveLength(1);
      expect(aprilEntries).toHaveLength(1);

      assertLogEntry(marchEntries[0], "March Book", "March Author");
      assertLogEntry(aprilEntries[0], "April Book", "April Author");
    });

    it("should handle concurrent writes to same log file", async () => {
      // Write multiple entries concurrently
      await Promise.all([
        logGoogleBooksFailure(TEST_LOG_DIR, "Book 1", "Author 1"),
        logGoogleBooksFailure(TEST_LOG_DIR, "Book 2", "Author 2"),
        logGoogleBooksFailure(TEST_LOG_DIR, "Book 3", "Author 3"),
        logGoogleBooksFailure(TEST_LOG_DIR, "Book 4", "Author 4"),
        logGoogleBooksFailure(TEST_LOG_DIR, "Book 5", "Author 5"),
      ]);

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      // All 5 entries should be present (order may vary)
      expect(entries).toHaveLength(5);
    });

    it("should include ISO 8601 timestamp", async () => {
      const beforeLog = new Date();
      await logGoogleBooksFailure(TEST_LOG_DIR, "Book", "Author");
      const afterLog = new Date();

      const logPath = getExpectedLogPath(TEST_LOG_DIR, new Date());
      const entries = readLogFile(logPath);

      const logTimestamp = new Date(entries[0].timestamp);

      // Timestamp should be between before and after
      expect(logTimestamp.getTime()).toBeGreaterThanOrEqual(
        beforeLog.getTime()
      );
      expect(logTimestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime());

      // Should be valid ISO 8601
      expect(entries[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
});
