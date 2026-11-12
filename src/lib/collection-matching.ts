import { normalizeString } from './string-utils.js';
import { validCatalogISBN, scoreCatalogCandidate } from '../services/book-catalog.service.js';

export interface CollectionMatchSource {
  isbn: string | null;
  titleAliases: string[];
  authorAliases: string[];
  catalogAliases?: Array<{title:string;author:string}>;
}

export interface LocalCollectionBook {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  _count?: { reviews: number };
}

export function normalizeCollectionISBN(value: string | null): string | null {
  const isbn = validCatalogISBN(value?.replace(/^ISBN(?:-1[03])?:?\s*/i, ''));
  if (!isbn || isbn.length === 13) return isbn;
  const body = `978${isbn.slice(0, 9)}`;
  const sum = [...body].reduce((s, n, i) => s + Number(n) * (i % 2 ? 3 : 1), 0);
  return `${body}${(10 - sum % 10) % 10}`;
}

export function findCollectionBookMatch(
  book: CollectionMatchSource,
  localBooks: LocalCollectionBook[],
): number | null {
  const isbn = normalizeCollectionISBN(book.isbn);
  const exact = isbn ? localBooks.filter(b => normalizeCollectionISBN(b.isbn) === isbn) : [];
  if (exact.length) {
    return [...exact].sort((a,b) => (b._count?.reviews || 0) - (a._count?.reviews || 0) || a.id - b.id)[0].id;
  }

  const normalize = (value: string) => normalizeString(value.normalize('NFKC').replace(/ё/gi, 'е'));
  const titles = new Set(book.titleAliases.map(normalize));
  const authors = new Set(book.authorAliases.map(normalize));
  const corrected = localBooks.filter(b => b.author && book.catalogAliases?.some(alias =>
    normalize(alias.title) === normalize(b.title) && normalize(alias.author) === normalize(b.author!)));
  if (corrected.length === 1) return corrected[0].id;
  const matches = localBooks.filter(b => b.author && titles.has(normalize(b.title)) && authors.has(normalize(b.author)));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) return null;

  // Allow subtitles, initials and transliterated author names, while requiring
  // strong agreement on both the work title and its author.
  const candidates = localBooks.flatMap(candidate => {
    const score = Math.max(...book.authorAliases.map(author => scoreCatalogCandidate({
      title: book.titleAliases[0], titleVariants: book.titleAliases.slice(1), author,
    }, candidate)));
    return score >= 0.91 ? [{ candidate, score }] : [];
  }).sort((a,b) => b.score-a.score);
  if (!candidates.length || (candidates[1] && candidates[0].score-candidates[1].score < 0.04)) return null;
  return candidates[0].candidate.id;
}
