/**
 * Unit tests for Telegram WebApp authentication
 * Focus: Edge cases and validation logic (NOT HMAC protocol testing)
 */

// Set BOT_TOKEN before importing config
process.env.BOT_TOKEN = 'test-bot-token-123';

import { describe, it, expect, vi } from 'vitest';
import { validateTelegramWebAppData } from '../../src/api/middleware/telegram-auth.js';
import { config } from '../../src/lib/config.js';
import crypto from 'crypto';

describe('Telegram Auth', () => {

  /**
   * Helper to generate a valid-looking initData string with predictable hash
   * NOTE: This doesn't create a real HMAC, just formats the data correctly
   */
  function createInitData(params: Record<string, string>): string {
    const entries = Object.entries(params);
    return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  }

  /**
   * Helper to create a properly signed initData (for valid auth tests)
   */
  function createSignedInitData(params: Record<string, string>): string {
    const { hash, ...restParams } = params;

    // Create data-check-string
    const dataCheckArray = Object.entries(restParams)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`);
    const dataCheckString = dataCheckArray.join('\n');

    // Generate secret key using same token as validation function
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return createInitData({ ...restParams, hash: calculatedHash });
  }

  describe('Hash validation edge cases', () => {
    it('should return null for missing hash parameter', () => {
      const initData = 'user={"id":123}&auth_date=1234567890';
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for empty hash', () => {
      const initData = 'hash=&user={"id":123}&auth_date=1234567890';
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should not crash on hash with wrong length', () => {
      // Short hash (should not crash due to buffer length mismatch)
      const initData = 'hash=abc&user={"id":123}&auth_date=1234567890';
      expect(() => validateTelegramWebAppData(initData)).not.toThrow();
      expect(validateTelegramWebAppData(initData)).toBeNull();
    });

    it('should not crash on very short hash', () => {
      const initData = 'hash=a&user={"id":123}&auth_date=1234567890';
      expect(() => validateTelegramWebAppData(initData)).not.toThrow();
      expect(validateTelegramWebAppData(initData)).toBeNull();
    });

    it('should return null for non-hex characters in hash', () => {
      const initData = 'hash=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz&user={"id":123}&auth_date=1234567890';
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });
  });

  describe('auth_date validation', () => {
    it('should return null for missing auth_date', () => {
      // Even with a valid hash format, missing auth_date should fail
      const initData = createInitData({
        hash: 'a'.repeat(64), // Valid hex length
        user: '{"id":123}',
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for empty auth_date', () => {
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: '',
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for non-numeric auth_date', () => {
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: 'not-a-number',
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for future timestamp', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: futureTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for timestamp way in the future (year 2286)', () => {
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: '9999999999', // Far future
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for expired timestamp (older than 1 hour)', () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: expiredTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for negative timestamp', () => {
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: '-1',
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for zero timestamp', () => {
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123}',
        auth_date: '0',
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });
  });

  describe('User JSON parsing', () => {
    it('should return null for missing user parameter', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for empty user parameter', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{incomplete',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for user object missing id field', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"name":"Alice"}',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for non-numeric id (string)', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":"not_a_number"}',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for null id', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":null}',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });

    it('should return null for float id', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: '{"id":123.456}',
        auth_date: currentTimestamp.toString(),
      });
      const result = validateTelegramWebAppData(initData);
      expect(result).toBeNull();
    });
  });

  describe('URLSearchParams edge cases', () => {
    it('should handle double ampersands gracefully', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = `hash=${'a'.repeat(64)}&&user={"id":123}&auth_date=${currentTimestamp}`;
      // Should not crash
      expect(() => validateTelegramWebAppData(initData)).not.toThrow();
    });

    it('should handle extra whitespace in values', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createInitData({
        hash: 'a'.repeat(64),
        user: ' {"id":123} ',
        auth_date: currentTimestamp.toString(),
      });
      // Should not crash on JSON parsing
      expect(() => validateTelegramWebAppData(initData)).not.toThrow();
    });
  });

  describe('Valid auth (with proper signature)', () => {
    it('should return user object for valid initData', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createSignedInitData({
        user: '{"id":123456789,"username":"testuser","first_name":"Test","last_name":"User"}',
        auth_date: currentTimestamp.toString(),
        hash: '', // Will be calculated
      });

      const result = validateTelegramWebAppData(initData);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(BigInt(123456789));
      expect(result?.username).toBe('testuser');
      expect(result?.first_name).toBe('Test');
      expect(result?.last_name).toBe('User');
    });

    it('should return user object without optional fields', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createSignedInitData({
        user: '{"id":123456789}',
        auth_date: currentTimestamp.toString(),
        hash: '',
      });

      const result = validateTelegramWebAppData(initData);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(BigInt(123456789));
      expect(result?.username).toBeUndefined();
      expect(result?.first_name).toBeUndefined();
      expect(result?.last_name).toBeUndefined();
    });

    it('should handle large user IDs (BigInt)', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const initData = createSignedInitData({
        user: '{"id":999999999999}', // Large ID
        auth_date: currentTimestamp.toString(),
        hash: '',
      });

      const result = validateTelegramWebAppData(initData);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(BigInt(999999999999));
    });
  });
});
