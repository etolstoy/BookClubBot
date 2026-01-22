import { useState, useEffect, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import { getReviewById, type Review as ReviewType } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import Layout from "../components/Layout";
import { useTranslation } from "../i18n/index.js";
import { ConfigContext } from "../App";
import { getReviewDeepLink } from "../lib/deepLinks.js";

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const config = useContext(ConfigContext);
  const [review, setReview] = useState<ReviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadReview() {
      try {
        setLoading(true);
        setError(null);
        const data = await getReviewById(parseInt(id!, 10));
        setReview(data.review);
      } catch (err) {
        console.error("Failed to load review:", err);
        setError("Рецензия не найдена");
      } finally {
        setLoading(false);
      }
    }

    loadReview();
  }, [id]);

  const shareUrl = config?.botUsername && review
    ? getReviewDeepLink(config.botUsername, review.id)
    : undefined;

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!review) return <ErrorMessage message="Рецензия не найдена" />;

  return (
    <Layout shareUrl={shareUrl}>
      <div className="p-4">
        {/* Book Info Card */}
        {review.book && (
          <Link
            to={`/book/${review.book.id}`}
            className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-tg-secondary no-underline hover:opacity-90 transition-opacity"
          >
            {review.book.coverUrl && (
              <img
                src={review.book.coverUrl}
                alt={review.book.title}
                className="w-16 h-24 object-cover rounded flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-tg-text mb-1">
                {review.book.title}
              </h2>
              {review.book.author && (
                <p className="text-sm text-tg-hint">
                  {t("common.by")} {review.book.author}
                </p>
              )}
            </div>
          </Link>
        )}

        {/* Review Card without book info and without share button */}
        <ReviewCard
          review={review}
          showBook={false}
          showShareButton={false}
        />
      </div>
    </Layout>
  );
}
