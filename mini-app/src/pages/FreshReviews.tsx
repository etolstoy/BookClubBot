import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getRecentReviews, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

const REVIEWS_PER_PAGE = 20;

export default function FreshReviews() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    return pageParam ? parseInt(pageParam, 10) : 1;
  });
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
      const newPage = page - 1;
      setPage(newPage);
      setSearchParams({ page: newPage.toString() });
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      const newPage = page + 1;
      setPage(newPage);
      setSearchParams({ page: newPage.toString() });
      window.scrollTo(0, 0);
    }
  };

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
      <button onClick={() => navigate("/")} className="px-4 py-2 rounded-full bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors mb-4 inline-flex items-center gap-2">
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
                onReviewDeleted={() => handleReviewDeleted(review.id)}
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
                  : "bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black border-2 border-transparent"
              }`}
            >
              ←
            </button>

            <span className="text-tg-hint">{t("common.page")} {page}</span>

            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className={`px-5 py-2 rounded-full font-medium transition-colors ${
                !hasMore
                  ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
                  : "bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black border-2 border-transparent"
              }`}
            >
              →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
