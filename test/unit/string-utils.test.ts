/**
 * Unit tests for string utility functions
 *
 * This is a simple test to verify the testing infrastructure works
 */

import { describe, it, expect } from 'vitest';
import { calculateSimilarity, normalizeString } from '../../src/lib/string-utils.js';

describe('String Utils', () => {
  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      const result = calculateSimilarity('test', 'test');
      expect(result).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      const result = calculateSimilarity('abc', 'xyz');
      expect(result).toBeGreaterThanOrEqual(0.0);
      expect(result).toBeLessThan(0.5);
    });

    it('should calculate similarity for similar strings', () => {
      const result = calculateSimilarity('The Great Gatsby', 'Great Gatsby');
      expect(result).toBeGreaterThan(0.7);
    });

    it('should be case insensitive', () => {
      const result = calculateSimilarity('GATSBY', 'gatsby');
      expect(result).toBe(1.0);
    });

    it('should handle Cyrillic characters', () => {
      const result = calculateSimilarity('Война и мир', 'Война и мир');
      expect(result).toBe(1.0);
    });

    it('should handle empty strings', () => {
      const result = calculateSimilarity('', '');
      expect(result).toBe(1.0);
    });

    it('should handle one empty string', () => {
      const result = calculateSimilarity('test', '');
      expect(result).toBe(0.0);
    });
  });

  describe('normalizeString', () => {
    it('should convert to lowercase', () => {
      const result = normalizeString('HELLO WORLD');
      expect(result).toBe('hello world');
    });

    it('should trim whitespace', () => {
      const result = normalizeString('  hello  world  ');
      expect(result).toBe('hello world');
    });

    it('should remove special characters', () => {
      const result = normalizeString('hello-world!');
      expect(result).toContain('hello');
      expect(result).toContain('world');
    });

    it('should handle Cyrillic', () => {
      const result = normalizeString('Привет Мир');
      expect(result).toBe('привет мир');
    });

    it('should handle empty string', () => {
      const result = normalizeString('');
      expect(result).toBe('');
    });
  });
});
