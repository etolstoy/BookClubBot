import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBook, type BookDetail, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import SentimentBadge from "../components/SentimentBadge";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

export default function Book() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadBook() {
      setLoading(true);
      setError(null);

      try {
        const result = await getBook(parseInt(id!, 10));
        setBook(result.book);
        setReviews(result.reviews);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadBook"));
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [id]);

  const handleReviewUpdated = (updatedReview: Review) => {
    // If the review was reassigned to a different book, remove it from this page
    if (updatedReview.book?.id !== parseInt(id!, 10)) {
      setReviews((prev) => prev.filter((r) => r.id !== updatedReview.id));

      // Update book stats to reflect the removed review
      if (book) {
        setBook({
          ...book,
          reviewCount: book.reviewCount - 1,
        });
      }
    } else {
      // Otherwise, update the review in place
      setReviews((prev) =>
        prev.map((r) => (r.id === updatedReview.id ? updatedReview : r))
      );
    }
  };

  const handleReviewDeleted = (reviewId: number, sentiment: string | null) => {
    // Remove the review from the list
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));

    // Update book stats to reflect the deleted review
    if (book) {
      const updatedSentiments = { ...book.sentiments };

      // Decrease the count for the review's sentiment
      if (sentiment === "positive") {
        updatedSentiments.positive = Math.max(0, updatedSentiments.positive - 1);
      } else if (sentiment === "negative") {
        updatedSentiments.negative = Math.max(0, updatedSentiments.negative - 1);
      } else if (sentiment === "neutral") {
        updatedSentiments.neutral = Math.max(0, updatedSentiments.neutral - 1);
      }

      setBook({
        ...book,
        reviewCount: Math.max(0, book.reviewCount - 1),
        sentiments: updatedSentiments,
      });
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!book) return <ErrorMessage message={t("book.notFound")} />;

  const filteredReviews = sentimentFilter
    ? reviews.filter((r) => r.sentiment === sentimentFilter)
    : reviews;

  const { positive, negative, neutral } = book.sentiments;

  return (
    <div className="p-4">
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors mb-4 inline-flex items-center gap-2">
        <span>&larr;</span>
        <span>{t("common.back")}</span>
      </button>

      <div className="flex gap-4 mb-6">
        <div className="w-24 h-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm text-center p-2">
              {t("common.noCover")}
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-xl font-bold text-tg-text">{book.title}</h1>
          {book.author && (
            <p className="text-tg-hint mt-1">{book.author}</p>
          )}
          {book.publicationYear && (
            <p className="text-sm text-tg-hint">{book.publicationYear}</p>
          )}
          {book.pageCount && (
            <p className="text-sm text-tg-hint">{t("book.pages", { count: book.pageCount })}</p>
          )}
        </div>
      </div>

      {book.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {book.genres.map((genre) => (
            <span
              key={genre}
              className="text-xs px-3 py-1 rounded-full bg-tg-secondary text-tg-hint"
            >
              {genre}
            </span>
          ))}
        </div>
      )}

      {book.description && (
        <div className="mb-6">
          <h2 className="font-semibold text-tg-text mb-2">{t("book.description")}</h2>
          <p className="text-sm text-tg-hint whitespace-pre-wrap">
            {book.description}
          </p>
        </div>
      )}

      {book.goodreadsUrl && (
        <div className="mb-6">
          <a
            href={book.goodreadsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-tg-text no-underline"
          >
            {t("book.viewOnGoodreads")}
          </a>
        </div>
      )}

      <div className="mb-4">
        <h2 className="font-semibold text-tg-text mb-2">
          {t("book.reviewsCount", { count: book.reviewCount })}
        </h2>

        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => setSentimentFilter(null)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              !sentimentFilter
                ? "bg-[#3D3D3D] text-white"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            {t("book.filters.all", { count: book.reviewCount })}
          </button>
          <button
            onClick={() => setSentimentFilter("positive")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
              sentimentFilter === "positive"
                ? "bg-[#3D3D3D] text-white"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="positive" /> ({positive})
          </button>
          <button
            onClick={() => setSentimentFilter("negative")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
              sentimentFilter === "negative"
                ? "bg-[#3D3D3D] text-white"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="negative" /> ({negative})
          </button>
          <button
            onClick={() => setSentimentFilter("neutral")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
              sentimentFilter === "neutral"
                ? "bg-[#3D3D3D] text-white"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="neutral" /> ({neutral})
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filteredReviews.length === 0 ? (
          <p className="text-center text-tg-hint py-4">{t("book.noReviews")}</p>
        ) : (
          filteredReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onReviewUpdated={handleReviewUpdated}
              onReviewDeleted={() => handleReviewDeleted(review.id, review.sentiment)}
            />
          ))
        )}
      </div>
    </div>
  );
}
