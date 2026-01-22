import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getRecentReviews, getStats, type Review } from "../api/client";
import SearchBar from "../components/SearchBar";
import SentimentBadge from "../components/SentimentBadge";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

export default function Home() {
  const navigate = useNavigate();
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

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/browse?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="p-4">
      {/* Search Bar */}
      <div className="mb-4">
        <SearchBar onSearch={handleSearch} placeholder={t("home.searchPlaceholder")} />
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
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 pl-4 pr-4 scroll-pl-4 snap-x snap-mandatory">
                {reviews.map((review) => {
                  const formattedDate = new Date(review.reviewedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <div key={review.id} className="flex-shrink-0 w-[85vw] max-w-md snap-start">
                      <div className="p-4 rounded-lg bg-tg-secondary h-[220px] flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <Link
                            to={`/reviewer/${review.telegramUserId}`}
                            className="font-medium text-tg-text no-underline"
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
                            className="flex items-start gap-2 mb-2 text-sm"
                          >
                            {review.book.coverUrl && (
                              <img
                                src={review.book.coverUrl}
                                alt={review.book.title}
                                className="w-8 h-12 object-cover rounded flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex flex-col">
                              <span className="text-tg-text font-medium">{review.book.title}</span>
                              {review.book.author && (
                                <span className="text-tg-hint text-xs">{review.book.author}</span>
                              )}
                            </div>
                          </Link>
                        )}

                        <p className="text-sm text-tg-text overflow-hidden mb-2" style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {review.reviewText}
                        </p>

                        <Link
                          to={`/review/${review.id}`}
                          className="text-sm text-tg-hint mt-auto no-underline"
                        >
                          {t("common.readMore")}
                        </Link>
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
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent no-underline"
              >
                <span className="text-2xl">📚</span>
                <span>{t("home.navigation.topBooks")}</span>
              </Link>
              <Link
                to="/top-authors"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent no-underline"
              >
                <span className="text-2xl">✍️</span>
                <span>{t("home.navigation.topAuthors")}</span>
              </Link>
              <Link
                to="/top-reviewers"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent no-underline"
              >
                <span className="text-2xl">🏆</span>
                <span>{t("home.navigation.topReviewers")}</span>
              </Link>
              <Link
                to="/fresh-reviews"
                className="px-6 py-4 rounded-[20px] bg-[#3D3D3D] text-white font-medium flex items-center justify-center gap-3 hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors text-lg border-2 border-transparent no-underline"
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
