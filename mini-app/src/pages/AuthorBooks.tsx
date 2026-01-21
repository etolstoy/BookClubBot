import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getAuthorBooks, type Book } from "../api/client.js";
import BookCard from "../components/BookCard.js";
import Loading from "../components/Loading.js";
import ErrorMessage from "../components/ErrorMessage.js";
import { useTranslation } from "../i18n/index.js";

const BOOKS_PER_PAGE = 20;

export default function AuthorBooks() {
  const { author: encodedAuthor } = useParams<{ author: string }>();
  const { t, plural } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    return pageParam ? parseInt(pageParam, 10) : 1;
  });
  const [hasMore, setHasMore] = useState(true);

  const authorName = encodedAuthor ? decodeURIComponent(encodedAuthor) : "";

  useEffect(() => {
    if (!authorName) {
      setError(t("errors.invalidAuthor"));
      setLoading(false);
      return;
    }

    async function loadBooks() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * BOOKS_PER_PAGE;
        const result = await getAuthorBooks(authorName, {
          limit: BOOKS_PER_PAGE,
          offset,
        });

        setBooks(result.books);
        setHasMore(result.books.length === BOOKS_PER_PAGE);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("errors.loadAuthorBooks")
        );
      } finally {
        setLoading(false);
      }
    }

    loadBooks();
  }, [page, authorName]);

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

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-2">
        {authorName}
      </h1>

      {!loading && !error && books.length > 0 && (
        <p className="text-tg-hint mb-4">
          {plural("plurals.books", books.length)}
        </p>
      )}

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && books.length === 0 && (
        <p className="text-center text-tg-hint py-8">
          {t("authorBooks.noBooks")}
        </p>
      )}

      {!loading && !error && books.length > 0 && (
        <>
          <div className="flex flex-col gap-3 mb-6">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>

          {/* Show pagination only if there are multiple pages */}
          {(page > 1 || hasMore) && (
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
          )}
        </>
      )}
    </div>
  );
}
