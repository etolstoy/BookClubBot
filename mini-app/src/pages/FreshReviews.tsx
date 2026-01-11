import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getRecentReviews, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

const REVIEWS_PER_PAGE = 20;

export default function FreshReviews() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function loadReviews() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * REVIEWS_PER_PAGE;
        const result = await getRecentReviews({ limit: REVIEWS_PER_PAGE, offset });

        setReviews(result.reviews);
        setHasMore(result.reviews.length === REVIEWS_PER_PAGE);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadReviews"));
      } finally{
        setLoading(false);
      }
    }

    loadReviews();
  }, [page]);

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(page - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      setPage(page + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleReviewUpdated = (updatedReview: Review) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === updatedReview.id ? updatedReview : r))
    );
  };

  return (
    <div className="p-4">
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors mb-4 inline-flex items-center gap-2">
        <span>&larr;</span>
        <span>{t("common.back")}</span>
      </button>

      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("freshReviews.title")}</h1>

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && reviews.length === 0 && (
        <p className="text-center text-tg-hint py-8">{t("freshReviews.noReviews")}</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <>
          <div className="flex flex-col gap-3 mb-6">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                showBook
                onReviewUpdated={handleReviewUpdated}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className={`px-5 py-2 rounded-full font-medium transition-colors ${
                page === 1
                  ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
                  : "bg-tg-button text-tg-button-text hover:opacity-80"
              }`}
            >
              {t("common.previous")}
            </button>

            <span className="text-tg-hint">{t("common.page")} {page}</span>

            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className={`px-5 py-2 rounded-full font-medium transition-colors ${
                !hasMore
                  ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
                  : "bg-tg-button text-tg-button-text hover:opacity-80"
              }`}
            >
              {t("common.next")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
