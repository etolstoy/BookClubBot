import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getReviewer, type Reviewer as ReviewerType, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

export default function Reviewer() {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const [reviewer, setReviewer] = useState<ReviewerType | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    async function loadReviewer() {
      setLoading(true);
      setError(null);

      try {
        const result = await getReviewer(userId!);
        setReviewer(result.reviewer);
        setReviews(result.reviews);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadReviewer"));
      } finally {
        setLoading(false);
      }
    }

    loadReviewer();
  }, [userId]);

  const handleReviewUpdated = (updatedReview: Review) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === updatedReview.id ? updatedReview : r))
    );
  };

  const handleReviewDeleted = (reviewId: number, sentiment: string | null) => {
    // Remove the review from the list
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));

    // Update reviewer stats to reflect the deleted review
    if (reviewer) {
      const updatedSentiments = { ...reviewer.sentiments };

      // Decrease the count for the review's sentiment
      if (sentiment === "positive") {
        updatedSentiments.positive = Math.max(0, updatedSentiments.positive - 1);
      } else if (sentiment === "negative") {
        updatedSentiments.negative = Math.max(0, updatedSentiments.negative - 1);
      } else if (sentiment === "neutral") {
        updatedSentiments.neutral = Math.max(0, updatedSentiments.neutral - 1);
      }

      setReviewer({
        ...reviewer,
        totalReviews: Math.max(0, reviewer.totalReviews - 1),
        sentiments: updatedSentiments,
      });
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!reviewer) return <ErrorMessage message={t("reviewer.notFound")} />;

  const displayName = reviewer.displayName || reviewer.username || t("common.anonymous");
  const { positive, negative, neutral } = reviewer.sentiments;

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-tg-text">{displayName}</h1>
        {reviewer.username && (
          <p className="text-tg-hint">@{reviewer.username}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-tg-secondary text-center">
          <div className="text-2xl font-bold text-tg-text">{reviewer.totalReviews}</div>
          <div className="text-sm text-tg-hint">{t("reviewer.totalReviews")}</div>
        </div>
        <div className="p-4 rounded-lg bg-tg-secondary">
          <div className="flex justify-center gap-4">
            <div className="text-center">
              <div className="text-lg">👍</div>
              <div className="text-sm text-tg-hint">{positive}</div>
            </div>
            <div className="text-center">
              <div className="text-lg">👎</div>
              <div className="text-sm text-tg-hint">{negative}</div>
            </div>
            <div className="text-center">
              <div className="text-lg">😐</div>
              <div className="text-sm text-tg-hint">{neutral}</div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-tg-text mb-3">{t("reviewer.reviewHistory")}</h2>

      <div className="flex flex-col gap-3">
        {reviews.length === 0 ? (
          <p className="text-center text-tg-hint py-4">{t("reviewer.noReviews")}</p>
        ) : (
          reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              showBook
              onReviewUpdated={handleReviewUpdated}
              onReviewDeleted={() => handleReviewDeleted(review.id, review.sentiment)}
            />
          ))
        )}
      </div>
    </div>
  );
}
