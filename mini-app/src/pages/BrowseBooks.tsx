import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { getBooks, searchBooks as searchBooksApi, type Book } from "../api/client";
import BookCard from "../components/BookCard";
import SearchBar from "../components/SearchBar";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

type SortOption = "recentlyReviewed" | "alphabetical";

export default function BrowseBooks() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || "recentlyReviewed"
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (searchQuery) {
        const result = await searchBooksApi(searchQuery);
        setBooks(result.books);
      } else {
        const result = await getBooks({ sortBy });
        setBooks(result.books);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.loadBooks"));
    } finally {
      setLoading(false);
    }
  }, [sortBy, searchQuery]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setSearchParams(query ? { q: query } : {});
    },
    [setSearchParams]
  );

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSort = e.target.value as SortOption;
      setSortBy(newSort);
      setSearchQuery("");
      setSearchParams({ sort: newSort });
    },
    [setSearchParams]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchParams({});
  }, [setSearchParams]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("browseBooks.title")}</h1>

      <div className="mb-4">
        <SearchBar onSearch={handleSearch} />
      </div>

      {searchQuery ? (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-tg-hint">
            {t("browseBooks.resultsFor", { query: searchQuery })}
          </span>
          <button
            onClick={clearSearch}
            className="text-sm text-tg-text"
          >
            {t("common.clear")}
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <select
            value={sortBy}
            onChange={handleSortChange}
            className="px-3 py-2 rounded-lg bg-tg-secondary text-tg-text border-none outline-none"
          >
            <option value="recentlyReviewed">{t("browseBooks.sortBy.recentlyReviewed")}</option>
            <option value="alphabetical">{t("browseBooks.sortBy.alphabetical")}</option>
          </select>
        </div>
      )}

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && books.length === 0 && (
        <p className="text-center text-tg-hint py-8">{t("browseBooks.noBooks")}</p>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="flex flex-col gap-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
