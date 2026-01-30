import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getPopularAuthors, type AuthorLeaderboardEntry } from "../api/client.js";
import Loading from "../components/Loading.js";
import ErrorMessage from "../components/ErrorMessage.js";
import PaginationControl from "../components/PaginationControl";
import { usePagination } from "../hooks/usePagination";
import { getRankEmoji } from "../lib/rankUtils";
import { useTranslation } from "../i18n/index.js";

export default function PopularAuthors() {
  const { t, plural } = useTranslation();
  const { page, hasMore, setHasMore, handlePrevPage, handleNextPage, itemsPerPage } = usePagination();
  const [authors, setAuthors] = useState<AuthorLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAuthors() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * itemsPerPage;
        const result = await getPopularAuthors({
          limit: itemsPerPage,
          offset,
          minReviews: 3,
        });

        setAuthors(result.authors);
        setHasMore(result.authors.length === itemsPerPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadAuthors"));
      } finally {
        setLoading(false);
      }
    }

    loadAuthors();
  }, [page, itemsPerPage]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">
        {t("popularAuthors.title")}
      </h1>

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && authors.length === 0 && (
        <p className="text-center text-tg-hint py-8">
          {t("popularAuthors.noAuthors")}
        </p>
      )}

      {!loading && !error && authors.length > 0 && (
        <>
          <div className="flex flex-col gap-3 mb-6">
            {authors.map((author) => (
              <Link
                key={author.author}
                to={`/author/${encodeURIComponent(author.author)}`}
                className="flex items-center gap-4 p-4 rounded-[20px] bg-tg-secondary hover:bg-opacity-80 transition-all no-underline"
              >
                <div className="flex-shrink-0 w-12 text-center text-2xl">
                  {getRankEmoji(author.rank)}
                </div>
                <div className="flex-1">
                  <div className="text-lg font-bold text-tg-text">
                    {author.author}
                  </div>
                  <div className="text-sm text-tg-hint">
                    {plural("plurals.reviews", author.reviewCount)}
                  </div>
                </div>
                <div className="text-tg-hint text-xl">→</div>
              </Link>
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
