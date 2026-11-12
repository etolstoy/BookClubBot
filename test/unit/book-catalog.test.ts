import { describe, it, expect } from 'vitest';
import { validCatalogISBN, scoreCatalogCandidate } from '../../src/services/book-catalog.service.js';

describe('catalog matching', () => {
  it('validates both ISBN checksums and rejects invented identifiers', () => {
    expect(validCatalogISBN('978-0-385-67652-6')).toBe('9780385676526');
    expect(validCatalogISBN('0-306-40615-2')).toBe('0306406152');
    expect(validCatalogISBN('0-8044-2957-X')).toBe('080442957X');
    expect(validCatalogISBN('9780385676527')).toBeNull();
    expect(validCatalogISBN('0306406153')).toBeNull();
    expect(validCatalogISBN('1234567890123')).toBeNull();
  });
  it('rejects another author even when the given names are the same', () => {
    expect(scoreCatalogCandidate({title:'On Writing',author:'Stephen King'}, {title:'On Writing',author:'Stephen Hawking'})).toBe(0);
    expect(scoreCatalogCandidate({title:'On Writing',author:'Stephen King'}, {title:'On Writing',author:null})).toBe(0);
    expect(scoreCatalogCandidate({title:'On Writing',author:'Stephen King'}, {title:'On Writing',author:'John King'})).toBe(0);
    expect(scoreCatalogCandidate({title:'Хулиномика',author:'Алексей Марков'}, {title:'Хулиномика',author:'Александр Марков'})).toBe(0);
  });
  it('accepts a translation alias and an initialized author', () => {
    expect(scoreCatalogCandidate({title:'Думай медленно… решай быстро',originalTitle:'Thinking, Fast and Slow',author:'Daniel Kahneman'},
      {title:'Thinking, Fast and Slow',author:'D. Kahneman'})).toBe(1);
  });
  it('accepts subtitles but rejects summaries and unrelated volumes', () => {
    const query={title:'Thinking, Fast and Slow',author:'Daniel Kahneman'};
    expect(scoreCatalogCandidate(query,{title:'Thinking, Fast and Slow: A New Edition',author:'Daniel Kahneman'})).toBeGreaterThan(.95);
    expect(scoreCatalogCandidate(query,{title:'Thinking, Fast and Slow in 30 minutes',author:'Daniel Kahneman'})).toBe(0);
    expect(scoreCatalogCandidate({title:'Dune',author:'Frank Herbert'},{title:'Dune Messiah',author:'Frank Herbert'})).toBe(0);
  });
  it('supports Cyrillic author spellings in Latin-script catalogues', () => {
    expect(scoreCatalogCandidate({title:'Война и мир',originalTitle:'War and Peace',author:'Лев Толстой'},
      {title:'War and Peace',author:'Leo Tolstoy'})).toBe(1);
  });
});
