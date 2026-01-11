import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getRecentReviews, getStats, type Review } from "../api/client";
import SentimentBadge from "../components/SentimentBadge";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

export default function Home() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<{ booksCount: number; reviewsCount: number; reviewersCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [reviewsData, statsData] = await Promise.all([
          getRecentReviews({ limit: 4 }),
          getStats(),
        ]);

        setReviews(reviewsData.reviews);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadData"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-6">
        <img src="/logo.png" alt="Вастрик.Книги" className="h-8 w-8" />
        <h1 className="text-2xl font-bold text-tg-text">Вастрик.Книги</h1>
      </div>

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <>
          {/* Statistics */}
          {stats && (
            <p className="text-sm text-tg-hint mb-8">
              {t("home.statistics.text", {
                booksCount: stats.booksCount,
                reviewsCount: stats.reviewsCount,
                reviewersCount: stats.reviewersCount
              })}
            </p>
          )}

          {/* Recent Reviews Gallery */}
          <section className="mb-8">
            <h2 className="text-xl font-bold text-tg-text mb-4">{t("home.sections.recentReviews")}</h2>
            {reviews.length === 0 ? (
              <p className="text-center text-tg-hint py-4">{t("home.noReviews")}</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
                {reviews.map((review, index) => {
                  const formattedDate = new Date(review.reviewedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <div key={review.id} className={`flex-shrink-0 w-[85vw] max-w-md snap-start ${index === 0 ? 'pl-4' : ''}`}>
                      <div className="p-4 rounded-lg bg-tg-secondary h-[190px] flex flex-col">
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

                        {review.book && (
                          <Link
                            to={`/book/${review.book.id}`}
                            className="flex items-center gap-2 mb-2 text-sm"
                          >
                            {review.book.coverUrl && (
                              <img
                                src={review.book.coverUrl}
                                alt={review.book.title}
                                className="w-8 h-12 object-cover rounded flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <span className="text-tg-link font-medium">{review.book.title}</span>
                              {review.book.author && (
                                <span className="text-tg-hint"> {t("common.by")} {review.book.author}</span>
                              )}
                            </div>
                          </Link>
                        )}

                        <p className="text-sm text-tg-text flex-1 overflow-hidden line-clamp-6 mb-2">
                          {review.reviewText}
                        </p>

                        {review.book && (
                          <Link
                            to={`/book/${review.book.id}`}
                            className="text-sm text-tg-link hover:underline mt-auto"
                          >
                            {t("common.readMore")}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Navigation Buttons */}
          <section className="mb-4">
            <div className="flex flex-col gap-3">
              <Link
                to="/top-books"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent"
              >
                <span className="text-2xl">📚</span>
                <span>{t("home.navigation.topBooks")}</span>
              </Link>
              <Link
                to="/top-reviewers"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent"
              >
                <span className="text-2xl">🏆</span>
                <span>{t("home.navigation.topReviewers")}</span>
              </Link>
              <Link
                to="/fresh-reviews"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent"
              >
                <span className="text-2xl">⭐</span>
                <span>{t("home.navigation.freshReviews")}</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
