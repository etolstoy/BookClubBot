/**
 * Unit tests for string utility functions
 *
 * This is a simple test to verify the testing infrastructure works
 */

import { describe, it, expect } from 'vitest';
import { calculateSimilarity, normalizeString, getRussianPluralReview } from '../../src/lib/string-utils.js';

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

  describe('getRussianPluralReview', () => {
    describe('Singular form (рецензия)', () => {
      it('should return singular for 1', () => {
        expect(getRussianPluralReview(1)).toBe('рецензия');
      });

      it('should return singular for 21', () => {
        expect(getRussianPluralReview(21)).toBe('рецензия');
      });

      it('should return singular for 31', () => {
        expect(getRussianPluralReview(31)).toBe('рецензия');
      });

      it('should return singular for 41', () => {
        expect(getRussianPluralReview(41)).toBe('рецензия');
      });

      it('should return singular for 101', () => {
        expect(getRussianPluralReview(101)).toBe('рецензия');
      });

      it('should return singular for 1001', () => {
        expect(getRussianPluralReview(1001)).toBe('рецензия');
      });
    });

    describe('Few form (рецензии)', () => {
      it('should return few for 2', () => {
        expect(getRussianPluralReview(2)).toBe('рецензии');
      });

      it('should return few for 3', () => {
        expect(getRussianPluralReview(3)).toBe('рецензии');
      });

      it('should return few for 4', () => {
        expect(getRussianPluralReview(4)).toBe('рецензии');
      });

      it('should return few for 22', () => {
        expect(getRussianPluralReview(22)).toBe('рецензии');
      });

      it('should return few for 23', () => {
        expect(getRussianPluralReview(23)).toBe('рецензии');
      });

      it('should return few for 24', () => {
        expect(getRussianPluralReview(24)).toBe('рецензии');
      });

      it('should return few for 102', () => {
        expect(getRussianPluralReview(102)).toBe('рецензии');
      });

      it('should return few for 103', () => {
        expect(getRussianPluralReview(103)).toBe('рецензии');
      });

      it('should return few for 104', () => {
        expect(getRussianPluralReview(104)).toBe('рецензии');
      });
    });

    describe('Many form (рецензий)', () => {
      it('should return many for 0', () => {
        expect(getRussianPluralReview(0)).toBe('рецензий');
      });

      it('should return many for 5', () => {
        expect(getRussianPluralReview(5)).toBe('рецензий');
      });

      it('should return many for 6', () => {
        expect(getRussianPluralReview(6)).toBe('рецензий');
      });

      it('should return many for 7', () => {
        expect(getRussianPluralReview(7)).toBe('рецензий');
      });

      it('should return many for 8', () => {
        expect(getRussianPluralReview(8)).toBe('рецензий');
      });

      it('should return many for 9', () => {
        expect(getRussianPluralReview(9)).toBe('рецензий');
      });

      it('should return many for 10', () => {
        expect(getRussianPluralReview(10)).toBe('рецензий');
      });

      it('should return many for 20', () => {
        expect(getRussianPluralReview(20)).toBe('рецензий');
      });

      it('should return many for 25', () => {
        expect(getRussianPluralReview(25)).toBe('рецензий');
      });

      it('should return many for 100', () => {
        expect(getRussianPluralReview(100)).toBe('рецензий');
      });
    });

    describe('Special case: 11-14 (рецензий)', () => {
      it('should return many for 11 (not singular)', () => {
        expect(getRussianPluralReview(11)).toBe('рецензий');
      });

      it('should return many for 12 (not few)', () => {
        expect(getRussianPluralReview(12)).toBe('рецензий');
      });

      it('should return many for 13 (not few)', () => {
        expect(getRussianPluralReview(13)).toBe('рецензий');
      });

      it('should return many for 14 (not few)', () => {
        expect(getRussianPluralReview(14)).toBe('рецензий');
      });

      it('should return many for 111 (not singular)', () => {
        expect(getRussianPluralReview(111)).toBe('рецензий');
      });

      it('should return many for 112 (not few)', () => {
        expect(getRussianPluralReview(112)).toBe('рецензий');
      });

      it('should return many for 113 (not few)', () => {
        expect(getRussianPluralReview(113)).toBe('рецензий');
      });

      it('should return many for 114 (not few)', () => {
        expect(getRussianPluralReview(114)).toBe('рецензий');
      });

      it('should return many for 211 (not singular)', () => {
        expect(getRussianPluralReview(211)).toBe('рецензий');
      });

      it('should return many for 212 (not few)', () => {
        expect(getRussianPluralReview(212)).toBe('рецензий');
      });
    });
  });
});
