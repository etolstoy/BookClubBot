import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getReviewer, type Reviewer as ReviewerType, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

export default function Reviewer() {
  const { userId } = useParams<{ userId: string }>();
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
        setError(err instanceof Error ? err.message : "Failed to load reviewer");
      } finally {
        setLoading(false);
      }
    }

    loadReviewer();
  }, [userId]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!reviewer) return <ErrorMessage message="Reviewer not found" />;

  const displayName = reviewer.displayName || reviewer.username || "Anonymous";
  const { positive, negative, neutral } = reviewer.sentiments;

  return (
    <div className="p-4">
      <Link to="/" className="text-tg-link hover:underline mb-4 inline-block">
        &larr; Back to catalog
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-tg-text">{displayName}</h1>
        {reviewer.username && (
          <p className="text-tg-hint">@{reviewer.username}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-tg-secondary text-center">
          <div className="text-2xl font-bold text-tg-text">{reviewer.totalReviews}</div>
          <div className="text-sm text-tg-hint">Total Reviews</div>
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

      <h2 className="font-semibold text-tg-text mb-3">Review History</h2>

      <div className="flex flex-col gap-3">
        {reviews.length === 0 ? (
          <p className="text-center text-tg-hint py-4">No reviews yet</p>
        ) : (
          reviews.map((review) => (
            <ReviewCard key={review.id} review={review} showBook />
          ))
        )}
      </div>
    </div>
  );
}
