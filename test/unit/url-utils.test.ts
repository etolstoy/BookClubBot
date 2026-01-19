/**
 * Unit tests for URL utility functions
 */

import { describe, it, expect } from 'vitest';
import { getGoogleBooksUrl, generateGoodreadsUrl } from '../../src/lib/url-utils.js';

describe('URL Utils', () => {
  describe('getGoogleBooksUrl', () => {
    it('should return correct URL for valid googleBooksId', () => {
      const result = getGoogleBooksUrl('abc123def');
      expect(result).toBe('https://books.google.com/books?id=abc123def');
    });

    it('should return null for null input', () => {
      const result = getGoogleBooksUrl(null);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = getGoogleBooksUrl('');
      expect(result).toBeNull();
    });

    it('should handle special characters in ID', () => {
      const result = getGoogleBooksUrl('abc-123_def');
      expect(result).toBe('https://books.google.com/books?id=abc-123_def');
    });

    it('should handle numeric IDs', () => {
      const result = getGoogleBooksUrl('123456789');
      expect(result).toBe('https://books.google.com/books?id=123456789');
    });
  });

  describe('generateGoodreadsUrl', () => {
    describe('ISBN-based URLs', () => {
      it('should generate ISBN-based URL with clean ISBN-13', () => {
        const result = generateGoodreadsUrl('9780747532699', 'Harry Potter', 'J.K. Rowling');
        expect(result).toBe('https://www.goodreads.com/book/isbn/9780747532699');
      });

      it('should generate ISBN-based URL with clean ISBN-10', () => {
        const result = generateGoodreadsUrl('0747532699', 'Harry Potter', 'J.K. Rowling');
        expect(result).toBe('https://www.goodreads.com/book/isbn/0747532699');
      });

      it('should clean hyphens from hyphenated ISBN-13', () => {
        const result = generateGoodreadsUrl('978-0-7475-3269-9', 'Harry Potter', 'J.K. Rowling');
        expect(result).toBe('https://www.goodreads.com/book/isbn/9780747532699');
      });

      it('should clean hyphens from hyphenated ISBN-10', () => {
        const result = generateGoodreadsUrl('0-7475-3269-9', 'Harry Potter', 'J.K. Rowling');
        expect(result).toBe('https://www.goodreads.com/book/isbn/0747532699');
      });

      it('should prioritize ISBN over title/author', () => {
        const result = generateGoodreadsUrl('9780747532699', '', null);
        expect(result).toBe('https://www.goodreads.com/book/isbn/9780747532699');
      });
    });

    describe('Search-based URLs (no ISBN)', () => {
      it('should generate search URL with title and author', () => {
        const result = generateGoodreadsUrl(null, 'War and Peace', 'Leo Tolstoy');
        expect(result).toBe('https://www.goodreads.com/search?q=War%20and%20Peace%20Leo%20Tolstoy');
      });

      it('should generate search URL with title only', () => {
        const result = generateGoodreadsUrl(null, 'War and Peace', null);
        expect(result).toBe('https://www.goodreads.com/search?q=War%20and%20Peace');
      });

      it('should URL-encode special characters in title', () => {
        const result = generateGoodreadsUrl(null, 'Book & Title!', null);
        expect(result).toBe('https://www.goodreads.com/search?q=Book%20%26%20Title!');
      });

      it('should URL-encode special characters in author', () => {
        const result = generateGoodreadsUrl(null, 'Book', 'Author & Co.');
        expect(result).toBe('https://www.goodreads.com/search?q=Book%20Author%20%26%20Co.');
      });

      it('should handle Cyrillic characters', () => {
        const result = generateGoodreadsUrl(null, 'Война и мир', 'Лев Толстой');
        expect(result).toContain('https://www.goodreads.com/search?q=');
        expect(result).toContain('%D0%92'); // URL-encoded Cyrillic
      });

      it('should handle quotes in title', () => {
        const result = generateGoodreadsUrl(null, 'The "Great" Book', 'Author');
        expect(result).toBe('https://www.goodreads.com/search?q=The%20%22Great%22%20Book%20Author');
      });
    });

    describe('Edge cases', () => {
      it('should use search fallback for empty ISBN string', () => {
        const result = generateGoodreadsUrl('', 'Harry Potter', 'J.K. Rowling');
        expect(result).toBe('https://www.goodreads.com/search?q=Harry%20Potter%20J.K.%20Rowling');
      });

      it('should handle title with leading/trailing spaces', () => {
        const result = generateGoodreadsUrl(null, '  Book Title  ', 'Author');
        expect(result).toBe('https://www.goodreads.com/search?q=%20%20Book%20Title%20%20%20Author');
      });

      it('should handle empty title', () => {
        const result = generateGoodreadsUrl(null, '', null);
        expect(result).toBe('https://www.goodreads.com/search?q=');
      });

      it('should handle empty title with author', () => {
        const result = generateGoodreadsUrl(null, '', 'Author');
        expect(result).toBe('https://www.goodreads.com/search?q=%20Author');
      });

      it('should handle null author', () => {
        const result = generateGoodreadsUrl(null, 'Book Title', null);
        expect(result).toBe('https://www.goodreads.com/search?q=Book%20Title');
      });

      it('should handle whitespace-only title', () => {
        const result = generateGoodreadsUrl(null, '   ', null);
        expect(result).toBe('https://www.goodreads.com/search?q=%20%20%20');
      });
    });
  });
});
