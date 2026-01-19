/**
 * Unit tests for ISBN utility functions
 */

import { describe, it, expect } from 'vitest';
import { isValidISBN, cleanISBN, detectISBN } from '../../src/lib/isbn-utils.js';

describe('ISBN Utils', () => {
  describe('isValidISBN', () => {
    describe('Valid ISBN-10 formats', () => {
      it('should validate clean ISBN-10', () => {
        expect(isValidISBN('0747532699')).toBe(true);
      });

      it('should validate hyphenated ISBN-10', () => {
        expect(isValidISBN('0-7475-3269-9')).toBe(true);
      });

      it('should validate ISBN-10 with X check digit', () => {
        expect(isValidISBN('043942089X')).toBe(true);
        expect(isValidISBN('0-439-42089-X')).toBe(true);
      });

      it('should validate ISBN-10 with spaces', () => {
        expect(isValidISBN('0 7475 3269 9')).toBe(true);
      });

      it('should validate ISBN-10 with ISBN-10 prefix', () => {
        expect(isValidISBN('ISBN-10: 0-7475-3269-9')).toBe(true);
        expect(isValidISBN('ISBN-10 0-7475-3269-9')).toBe(true);
      });
    });

    describe('Valid ISBN-13 formats', () => {
      it('should validate clean ISBN-13', () => {
        expect(isValidISBN('9780747532699')).toBe(true);
      });

      it('should validate hyphenated ISBN-13', () => {
        expect(isValidISBN('978-0-7475-3269-9')).toBe(true);
      });

      it('should validate ISBN-13 with spaces', () => {
        expect(isValidISBN('978 0 7475 3269 9')).toBe(true);
      });

      it('should validate ISBN-13 with ISBN-13 prefix', () => {
        expect(isValidISBN('ISBN-13: 978-0-7475-3269-9')).toBe(true);
        expect(isValidISBN('ISBN-13 978-0-7475-3269-9')).toBe(true);
      });

      it('should validate ISBN-13 with generic ISBN prefix', () => {
        expect(isValidISBN('ISBN: 978-0-7475-3269-9')).toBe(true);
        expect(isValidISBN('ISBN 978-0-7475-3269-9')).toBe(true);
      });
    });

    describe('Invalid formats', () => {
      it('should reject too short ISBN', () => {
        expect(isValidISBN('978074753')).toBe(false);
        expect(isValidISBN('123')).toBe(false);
      });

      it('should reject too long ISBN', () => {
        expect(isValidISBN('97807475326999')).toBe(false);
        expect(isValidISBN('12345678901234')).toBe(false);
      });

      it('should reject invalid characters in ISBN-13', () => {
        expect(isValidISBN('978-0-7475-3269-Z')).toBe(false);
        expect(isValidISBN('978-0-7475-3269-a')).toBe(false);
      });

      it('should reject X check digit in wrong position (ISBN-10 only at end)', () => {
        expect(isValidISBN('X747532699')).toBe(false);
        expect(isValidISBN('074X532699')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidISBN('')).toBe(false);
      });

      it('should reject non-ISBN text', () => {
        expect(isValidISBN('War and Peace')).toBe(false);
        expect(isValidISBN('Not an ISBN')).toBe(false);
      });

      it('should reject pure letters', () => {
        expect(isValidISBN('ABCDEFGHIJ')).toBe(false);
      });

      it('should reject numbers without proper format', () => {
        expect(isValidISBN('12345')).toBe(false);
      });
    });
  });

  describe('cleanISBN', () => {
    it('should remove hyphens from ISBN-13', () => {
      const result = cleanISBN('978-0-7475-3269-9');
      expect(result).toBe('9780747532699');
    });

    it('should remove hyphens from ISBN-10', () => {
      const result = cleanISBN('0-7475-3269-9');
      expect(result).toBe('0747532699');
    });

    it('should remove spaces', () => {
      const result = cleanISBN('978 0 7475 3269 9');
      expect(result).toBe('9780747532699');
    });

    it('should remove both hyphens and spaces', () => {
      const result = cleanISBN('978-0-7475 3269-9');
      expect(result).toBe('9780747532699');
    });

    it('should return same string if already clean', () => {
      const result = cleanISBN('9780747532699');
      expect(result).toBe('9780747532699');
    });

    it('should handle empty string', () => {
      const result = cleanISBN('');
      expect(result).toBe('');
    });

    it('should preserve X check digit', () => {
      const result = cleanISBN('0-439-42089-X');
      expect(result).toBe('043942089X');
    });

    it('should handle multiple consecutive hyphens/spaces', () => {
      const result = cleanISBN('978--0  7475-3269-9');
      expect(result).toBe('9780747532699');
    });
  });

  describe('detectISBN', () => {
    describe('ISBN-10 detection', () => {
      it('should detect clean ISBN-10', () => {
        const result = detectISBN('0747532699');
        expect(result).toBe('0747532699');
      });

      it('should detect and clean hyphenated ISBN-10', () => {
        const result = detectISBN('0-7475-3269-9');
        expect(result).toBe('0747532699');
      });

      it('should detect and clean ISBN-10 with spaces', () => {
        const result = detectISBN('0 7475 3269 9');
        expect(result).toBe('0747532699');
      });
    });

    describe('ISBN-13 detection', () => {
      it('should detect clean ISBN-13', () => {
        const result = detectISBN('9780747532699');
        expect(result).toBe('9780747532699');
      });

      it('should detect and clean hyphenated ISBN-13', () => {
        const result = detectISBN('978-0-7475-3269-9');
        expect(result).toBe('9780747532699');
      });

      it('should detect and clean ISBN-13 with spaces', () => {
        const result = detectISBN('978 0 7475 3269 9');
        expect(result).toBe('9780747532699');
      });
    });

    describe('Non-ISBN queries', () => {
      it('should return null for book title', () => {
        const result = detectISBN('War and Peace');
        expect(result).toBeNull();
      });

      it('should return null for partial ISBN (too short)', () => {
        const result = detectISBN('978074753');
        expect(result).toBeNull();
      });

      it('should return null for too long number', () => {
        const result = detectISBN('97807475326999');
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        const result = detectISBN('');
        expect(result).toBeNull();
      });

      it('should return null for mixed text and numbers', () => {
        const result = detectISBN('ISBN: 978-0-7475-3269-9');
        expect(result).toBeNull();
      });

      it('should return null for 11-digit number', () => {
        const result = detectISBN('12345678901');
        expect(result).toBeNull();
      });

      it('should return null for 12-digit number', () => {
        const result = detectISBN('123456789012');
        expect(result).toBeNull();
      });
    });

    describe('Edge cases', () => {
      it('should handle ISBN with leading/trailing spaces', () => {
        const result = detectISBN('  978-0-7475-3269-9  ');
        expect(result).toBe('9780747532699');
      });

      it('should not detect X check digit as valid (simple digit check)', () => {
        // detectISBN uses simple digit count, doesn't handle X
        const result = detectISBN('043942089X');
        expect(result).toBeNull(); // Has X, not pure digits
      });
    });
  });
});
