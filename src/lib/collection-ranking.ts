export const COLLECTION_VOTE_WEIGHT = 0.2;
export const COLLECTION_BASE_BOOK_LIMIT = 15;
export const COLLECTION_BOOK_LIMIT = 20;
export const COLLECTION_MIN_EXTENSION_SPREAD = 0.1;
export const COLLECTION_MIN_CUTOFF_GAP = 0.05;

/** Expand only when the added bracket has signal and the last book has a clear cutoff. */
export function selectCollectionBooks<T extends {score:number}>(ranked: readonly T[]) {
  const firstExtra = ranked[COLLECTION_BASE_BOOK_LIMIT];
  const lastExtra = ranked[COLLECTION_BOOK_LIMIT-1];
  const next = ranked[COLLECTION_BOOK_LIMIT];
  const extensionSpread = firstExtra && lastExtra ? firstExtra.score-lastExtra.score : null;
  const cutoffGap = lastExtra && next ? lastExtra.score-next.score : null;
  const epsilon = 1e-9;
  const reason = !lastExtra ? 'insufficient_books'
    : extensionSpread! + epsilon < COLLECTION_MIN_EXTENSION_SPREAD ? 'flat_extension'
    : cutoffGap !== null && cutoffGap + epsilon < COLLECTION_MIN_CUTOFF_GAP ? 'weak_cutoff'
    : 'clear_extension';
  const expanded = reason === 'clear_extension';
  return {
    books:ranked.slice(0,expanded ? COLLECTION_BOOK_LIMIT : COLLECTION_BASE_BOOK_LIMIT),
    expanded, reason,
    extensionSpread:extensionSpread === null ? null : Number(extensionSpread.toFixed(6)),
    cutoffGap:cutoffGap === null ? null : Number(cutoffGap.toFixed(6)),
  };
}

export interface CollectionMention {
  messageId: string;
  messageType: string;
  stance: string;
  votes: number | null;
  booksInMessage: number;
}

export interface CollectionSourceBook {
  id: string;
  title: string;
  originalTitle?: string | null;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  metadataStatus: string;
  kind: string;
  aliases?: string[];
  mentions: CollectionMention[];
}

export interface CollectionRanking {
  mentions: number;
  allMentions: number;
  votes: number;
  weightedVotes: number;
  score: number;
}

/** One extra recommendation requires a 32x increase in (1 + shared votes). */
export function calculateCollectionScore(
  mentions: number,
  weightedVotes: number,
  voteWeight = COLLECTION_VOTE_WEIGHT,
): number {
  return Math.max(0, mentions) + voteWeight * Math.log2(1 + Math.max(0, weightedVotes));
}

export function rankCollectionBooks(
  books: CollectionSourceBook[],
  intent: 'recommendations' | 'anti_recommendations' = 'recommendations',
  voteWeight = COLLECTION_VOTE_WEIGHT,
): Array<Omit<CollectionSourceBook, 'mentions'> & CollectionRanking> {
  const stance = intent === 'anti_recommendations' ? 'negative' : 'positive';
  return books.flatMap(book => {
    if (book.kind !== 'book' || book.metadataStatus !== 'complete'
      || !book.title || !book.author || !book.isbn || !book.coverUrl) return [];

    const unique = [...new Map(book.mentions.map(m => [m.messageId, m])).values()];
    const relevant = unique.filter(m => m.stance === stance);
    if (!relevant.length) return [];
    const comments = relevant.filter(m => m.messageType !== 'post');
    const votes = comments.reduce((sum, m) => sum + Math.max(0, m.votes || 0), 0);
    const weightedVotes = comments.reduce((sum, m) =>
      sum + Math.max(0, m.votes || 0) / Math.max(1, m.booksInMessage), 0);

    return [{ ...book, mentions: relevant.length, allMentions: unique.length,
      votes, weightedVotes, score: calculateCollectionScore(relevant.length, weightedVotes, voteWeight) }];
  }).sort((a, b) => b.score - a.score || b.mentions - a.mentions
    || b.weightedVotes - a.weightedVotes || a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id));
}
