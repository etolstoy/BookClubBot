import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getAuthorBooks, type Book } from "../api/client.js";
import BookCard from "../components/BookCard.js";
import Loading from "../components/Loading.js";
import ErrorMessage from "../components/ErrorMessage.js";
import PaginationControl from "../components/PaginationControl";
import { usePagination } from "../hooks/usePagination";
import { useTranslation } from "../i18n/index.js";

export default function AuthorBooks() {
  const { author: encodedAuthor } = useParams<{ author: string }>();
  const { t, plural } = useTranslation();
  const { page, hasMore, setHasMore, handlePrevPage, handleNextPage, itemsPerPage } = usePagination();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const offset = (page - 1) * itemsPerPage;
        const result = await getAuthorBooks(authorName, {
          limit: itemsPerPage,
          offset,
        });

        setBooks(result.books);
        setHasMore(result.books.length === itemsPerPage);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("errors.loadAuthorBooks")
        );
      } finally {
        setLoading(false);
      }
    }

    loadBooks();
  }, [page, authorName, itemsPerPage]);

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
            <PaginationControl
              page={page}
              hasMore={hasMore}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
            />
          )}
        </>
      )}
    </div>
  );
}
