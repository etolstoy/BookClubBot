import { Link } from "react-router-dom";
import type { Review } from "../api/client";
import SentimentBadge from "./SentimentBadge";

interface ReviewCardProps {
  review: Review;
  showBook?: boolean;
}

export default function ReviewCard({ review, showBook = false }: ReviewCardProps) {
  const formattedDate = new Date(review.reviewedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="p-4 rounded-lg bg-tg-secondary">
      <div className="flex items-center justify-between mb-2">
        <Link
          to={`/reviewer/${review.telegramUserId}`}
          className="font-medium text-tg-link hover:underline"
        >
          {review.reviewerName}
        </Link>
        <div className="flex items-center gap-2">
          {review.sentiment && <SentimentBadge sentiment={review.sentiment} />}
          <span className="text-xs text-tg-hint">{formattedDate}</span>
        </div>
      </div>

      {showBook && review.book && (
        <Link
          to={`/book/${review.book.id}`}
          className="flex items-center gap-2 mb-2 text-sm"
        >
          {review.book.coverUrl && (
            <img
              src={review.book.coverUrl}
              alt={review.book.title}
              className="w-8 h-12 object-cover rounded"
            />
          )}
          <div>
            <span className="text-tg-link font-medium">{review.book.title}</span>
            {review.book.author && (
              <span className="text-tg-hint"> by {review.book.author}</span>
            )}
          </div>
        </Link>
      )}

      <p className="text-sm text-tg-text whitespace-pre-wrap">{review.reviewText}</p>
    </div>
  );
}
