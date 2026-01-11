import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getReviewer, type Reviewer as ReviewerType, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

export default function Reviewer() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
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

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!reviewer) return <ErrorMessage message={t("reviewer.notFound")} />;

  const displayName = reviewer.displayName || reviewer.username || t("common.anonymous");
  const { positive, negative, neutral } = reviewer.sentiments;

  return (
    <div className="p-4">
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors mb-4 inline-flex items-center gap-2">
        <span>&larr;</span>
        <span>{t("common.back")}</span>
      </button>

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
            />
          ))
        )}
      </div>
    </div>
  );
}
