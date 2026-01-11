import { Link } from "react-router-dom";
import type { Book } from "../api/client";
import SentimentBadge from "./SentimentBadge";
import { useTranslation } from "../i18n/index.js";

interface BookCardProps {
  book: Book;
}

export default function BookCard({ book }: BookCardProps) {
  const { t, plural } = useTranslation();
  const totalSentiments =
    book.sentiments.positive + book.sentiments.negative + book.sentiments.neutral;
  const dominantSentiment =
    totalSentiments > 0
      ? book.sentiments.positive >= book.sentiments.negative &&
        book.sentiments.positive >= book.sentiments.neutral
        ? "positive"
        : book.sentiments.negative >= book.sentiments.neutral
        ? "negative"
        : "neutral"
      : null;

  return (
    <Link
      to={`/book/${book.id}`}
      className="flex gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity no-underline"
    >
      <div className="w-16 h-24 flex-shrink-0 rounded overflow-hidden bg-gray-200">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-1">
            {t("common.noCover")}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-tg-text truncate">{book.title}</h3>
        {book.author && (
          <p className="text-sm text-tg-hint truncate">{book.author}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-tg-hint">
            {plural("plurals.reviews", book.reviewCount)}
          </span>
          {dominantSentiment && <SentimentBadge sentiment={dominantSentiment} />}
        </div>
        {book.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {book.genres.slice(0, 2).map((genre) => (
              <span
                key={genre}
                className="text-xs px-2 py-0.5 rounded-full bg-tg-bg text-tg-hint"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
