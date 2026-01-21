import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getPopularAuthors, type AuthorLeaderboardEntry } from "../api/client.js";
import Loading from "../components/Loading.js";
import ErrorMessage from "../components/ErrorMessage.js";
import { useTranslation } from "../i18n/index.js";

const AUTHORS_PER_PAGE = 20;

export default function PopularAuthors() {
  const { t, plural } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authors, setAuthors] = useState<AuthorLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    return pageParam ? parseInt(pageParam, 10) : 1;
  });
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function loadAuthors() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * AUTHORS_PER_PAGE;
        const result = await getPopularAuthors({
          limit: AUTHORS_PER_PAGE,
          offset,
          minReviews: 3,
        });

        setAuthors(result.authors);
        setHasMore(result.authors.length === AUTHORS_PER_PAGE);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadAuthors"));
      } finally {
        setLoading(false);
      }
    }

    loadAuthors();
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

  const getMedalEmoji = (rank: number): string => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}.`;
  };

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
                  {getMedalEmoji(author.rank)}
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

            <span className="text-tg-hint">
              {t("common.page")} {page}
            </span>

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
