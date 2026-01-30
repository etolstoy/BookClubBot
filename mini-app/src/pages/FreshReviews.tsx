import { useState, useEffect } from "react";
import { getRecentReviews, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import PaginationControl from "../components/PaginationControl";
import { usePagination } from "../hooks/usePagination";
import { useTranslation } from "../i18n/index.js";

export default function FreshReviews() {
  const { t } = useTranslation();
  const { page, hasMore, setHasMore, handlePrevPage, handleNextPage, itemsPerPage } = usePagination();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReviews() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * itemsPerPage;
        const result = await getRecentReviews({ limit: itemsPerPage, offset });

        setReviews(result.reviews);
        setHasMore(result.reviews.length === itemsPerPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadReviews"));
      } finally{
        setLoading(false);
      }
    }

    loadReviews();
  }, [page, itemsPerPage]);

  const handleReviewUpdated = (updatedReview: Review) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === updatedReview.id ? updatedReview : r))
    );
  };

  const handleReviewDeleted = (reviewId: number) => {
    // Remove the review from the list
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
  };

  return (
    <div className="p-4">
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
                onReviewDeleted={() => handleReviewDeleted(review.id)}
              />
            ))}
          </div>

          <PaginationControl
            page={page}
            hasMore={hasMore}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </>
      )}
    </div>
  );
}
