import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getRecentReviews, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

const REVIEWS_PER_PAGE = 20;

export default function FreshReviews() {
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
        setError(err instanceof Error ? err.message : "Failed to load reviews");
      } finally {
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

  return (
    <div className="p-4">
      <Link to="/" className="text-tg-link hover:underline mb-4 inline-block">
        &larr; Back to home
      </Link>

      <h1 className="text-2xl font-bold text-tg-text mb-4">Fresh Reviews</h1>

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && reviews.length === 0 && (
        <p className="text-center text-tg-hint py-8">No reviews yet</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <>
          <div className="flex flex-col gap-3 mb-6">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} showBook />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className={`px-4 py-2 rounded-lg font-medium ${
                page === 1
                  ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
                  : "bg-tg-button text-tg-button-text hover:opacity-80"
              }`}
            >
              Previous
            </button>

            <span className="text-tg-hint">Page {page}</span>

            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className={`px-4 py-2 rounded-lg font-medium ${
                !hasMore
                  ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
                  : "bg-tg-button text-tg-button-text hover:opacity-80"
              }`}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
