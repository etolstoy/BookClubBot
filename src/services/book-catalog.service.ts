import { GoogleBooksClient } from '../clients/book-data/google-books-client.js';
import { calculateSimilarity } from '../lib/string-utils.js';
import type { BookSearchResult } from '../lib/interfaces/book-data-client.interface.js';

export interface CatalogQuery {
  title: string;
  originalTitle?: string | null;
  author?: string | null;
  titleVariants?: string[];
}

export interface CatalogMatch {
  title: string;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  source: 'google_books' | 'open_library';
  sourceUrl: string;
  editionTitle: string;
  editionId: string;
  score: number;
  complete: boolean;
}

const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Check the actual ISBN checksum, rather than only its length/format. */
export function validCatalogISBN(value: string | null | undefined): string | null {
  if (!value) return null;
  const isbn = value.toUpperCase().replace(/[^0-9X]/g, '');
  if (/^97[89]\d{10}$/.test(isbn)) {
    const sum = [...isbn].reduce((s, n, i) => s + Number(n) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? isbn : null;
  }
  if (/^\d{9}[0-9X]$/.test(isbn)) {
    const sum = [...isbn].reduce((s, n, i) => s + (n === 'X' ? 10 : Number(n)) * (10 - i), 0);
    return sum % 11 === 0 ? isbn : null;
  }
  return null;
}

const cyrillic: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
  р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
const latin = (s: string) => [...normalize(s)].map(c => cyrillic[c] ?? c).join('');

/** Reject similarly named works by another author and commercial summaries. */
export function scoreCatalogCandidate(query: CatalogQuery, candidate: { title: string; author: string | null }): number {
  const titles = [query.title, query.originalTitle, ...(query.titleVariants || [])].filter((s): s is string => !!s);
  const title = normalize(candidate.title);
  const unwanted = /\b(summary|summaries|workbook|analysis|key takeaways|study guide|quick read|in 30 minutes|саммари|краткое содержание|краткий пересказ|конспект)\b/i;
  if (unwanted.test(candidate.title) && !titles.some(t => unwanted.test(t))) return 0;
  const titleScore = Math.max(...titles.map(t => {
    const expected = normalize(t);
    if (title === expected) return 1;
    // A subtitle is fine, a volume number or a different work is not.
    const base = normalize(candidate.title.split(/[:：]/)[0]);
    const expectedBase = normalize(t.split(/[:：]/)[0]);
    if (base === expectedBase && base.length >= 9) return 0.97;
    return calculateSimilarity(expected, title);
  }));
  if (titleScore < 0.80) return 0;
  if (!query.author) return titleScore * 0.92;
  if (!candidate.author) return 0;
  const actualWords = latin(candidate.author).split(' ').filter(w => w.length > 2);
  const surnames = query.author.split(/,|;/).map(a => latin(a.trim()).split(' ').at(-1) || '');
  const authorMatch = surnames.some(surname => surname.length > 2 && actualWords.some(w => calculateSimilarity(surname, w) >= 0.78));
  if (authorMatch && !/[,;]/.test(query.author) && !/[,;]/.test(candidate.author)) {
    const expectedFirst = normalize(query.author).split(' ')[0];
    const actualFirst = normalize(candidate.author).split(' ')[0];
    const sameScript = /\p{Script=Cyrillic}/u.test(expectedFirst) === /\p{Script=Cyrillic}/u.test(actualFirst);
    if (sameScript && expectedFirst.length >= 4 && actualFirst.length >= 4
      && calculateSimilarity(expectedFirst, actualFirst) < 0.6) return 0;
  }
  return authorMatch ? titleScore : 0;
}

export class BookCatalog {
  private google: GoogleBooksClient;
  private googleQueue: Promise<unknown> = Promise.resolve();
  private libraryQueue: Promise<unknown> = Promise.resolve();

  constructor(apiKey?: string) {
    // Deliberately omit notification callbacks: batch import must not message Telegram.
    this.google = new GoogleBooksClient({ apiKey, rateLimitDelayMs: 220, maxRetries: 2 });
  }

  private googleSearch(query: string): Promise<BookSearchResult[]> {
    const result = this.googleQueue.then(() => this.google.searchBooks(query, 8));
    this.googleQueue = result.catch(() => undefined);
    return result;
  }

  private libraryJson(url: string): Promise<any> {
    const result = this.libraryQueue.then(async () => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'BookClubBot/1.0 (book metadata research; https://github.com/etolstoy/BookClubBot)' },
        signal: AbortSignal.timeout(25000),
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
      return response.json();
    });
    this.libraryQueue = result.catch(() => undefined);
    return result;
  }

  async resolve(query: CatalogQuery): Promise<{ match: CatalogMatch | null; candidates: CatalogMatch[]; errors: string[] }> {
    const candidates: CatalogMatch[] = [], errors: string[] = [];
    const titles = [...new Set([query.originalTitle, query.title, ...(query.titleVariants || [])].filter((s): s is string => !!s))];
    for (const title of titles.slice(0, 3)) {
      const surname = query.author?.split(',')[0].trim().split(' ').at(-1);
      const search = `intitle:"${title.replace(/"/g, '')}"${surname ? ` inauthor:${surname}` : ''}`;
      try {
        const results = await this.googleSearch(search);
        for (const book of results) {
          const score = scoreCatalogCandidate(query, book);
          if (score === 0) continue;
          const isbn = validCatalogISBN(book.isbn);
          const coverUrl = book.coverUrl?.replace(/^http:/, 'https:') || null;
          candidates.push({ title: query.title, author: query.author || book.author,
            isbn, coverUrl, source: 'google_books', sourceUrl: `https://books.google.com/books?id=${book.googleBooksId}`,
            editionTitle: book.title, editionId: book.googleBooksId, score, complete: !!(isbn && coverUrl && query.author && book.author),
          });
        }
        if (candidates.some(c => c.complete && c.score >= 0.95)) break;
      } catch (e) { errors.push(`google_books: ${e instanceof Error ? e.message.split('\n')[0] : 'request failed'}`); }
    }
    if (!candidates.some(c => c.complete && c.score >= 0.95)) {
      for (const title of titles.slice(0, 2)) {
        try {
          const params = new URLSearchParams({ title, limit: '5', fields: 'key,title,author_name,editions,editions.key,editions.title', lang: 'en' });
          if (query.author) params.set('author', query.author.split(',')[0]);
          const data = await this.libraryJson(`https://openlibrary.org/search.json?${params}`);
          for (const work of data.docs || []) {
            const score = scoreCatalogCandidate(query, { title: work.title, author: work.author_name?.join(', ') || null });
            if (score === 0) continue;
            const edition = work.editions?.docs?.[0];
            if (!edition?.key) continue;
            const detail = await this.libraryJson(`https://openlibrary.org${edition.key}.json`);
            const isbn = [...(detail.isbn_13 || []), ...(detail.isbn_10 || [])].map(validCatalogISBN).find(Boolean) || null;
            const cover = detail.covers?.find((n: number) => n > 0);
            const coverUrl = cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : null;
            candidates.push({ title: query.title, author: query.author || work.author_name?.join(', ') || null,
              isbn, coverUrl, source: 'open_library', sourceUrl: `https://openlibrary.org${edition.key}`,
              editionTitle: detail.title, editionId: edition.key, score,
              complete: !!(isbn && coverUrl && query.author && work.author_name?.length),
            });
            if (candidates.some(c => c.complete && c.score >= 0.95)) break;
          }
          if (candidates.some(c => c.complete && c.score >= 0.95)) break;
        } catch (e) { errors.push(`open_library: ${e instanceof Error ? e.message.split('\n')[0] : 'request failed'}`); }
      }
    }
    candidates.sort((a, b) => Number(b.complete) - Number(a.complete) || b.score - a.score);
    const unique = candidates.filter((c, i) => candidates.findIndex(x => x.source === c.source && x.editionId === c.editionId) === i);
    return { match: unique[0] || null, candidates: unique.slice(0, 5), errors };
  }
}
