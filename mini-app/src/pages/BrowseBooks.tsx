import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  unifiedSearch,
  type SearchResult,
  type SearchTabType,
} from "../api/client";
import BookCard from "../components/BookCard";
import AuthorCard from "../components/AuthorCard";
import UserCard from "../components/UserCard";
import ReviewCard from "../components/ReviewCard";
import SearchBar from "../components/SearchBar";
import SearchTabs from "../components/SearchTabs";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

const ITEMS_PER_PAGE = 20;

export default function BrowseBooks() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<SearchTabType>("all");
  const searchQuery = searchParams.get("q") || "";

  const loadBooks = useCallback(async () => {
    // Don't load anything if no search query - show empty state
    if (!searchQuery) {
      setSearchResults([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setOffset(0);

    try {
      const result = await unifiedSearch(searchQuery, activeTab, ITEMS_PER_PAGE, 0);
      setSearchResults(result.results);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeTab]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchParams(query ? { q: query } : {});
      setActiveTab("all");
    },
    [setSearchParams]
  );

  const handleTabChange = useCallback(
    (tab: SearchTabType) => {
      setActiveTab(tab);
    },
    []
  );

  const clearSearch = useCallback(() => {
    setSearchParams({});
    setActiveTab("all");
  }, [setSearchParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !searchQuery) return;

    setLoadingMore(true);
    try {
      const newOffset = offset + ITEMS_PER_PAGE;
      const result = await unifiedSearch(searchQuery, activeTab, ITEMS_PER_PAGE, newOffset);
      setSearchResults((prev) => [...prev, ...result.results]);
      setHasMore(result.hasMore);
      setOffset(newOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, searchQuery, activeTab, offset]);

  const renderSearchResult = (result: SearchResult, index: number) => {
    switch (result.type) {
      case "book":
        return (
          <BookCard
            key={`book-${result.data.id}`}
            book={{
              ...result.data,
              genres: [],
              publicationYear: null,
            }}
          />
        );
      case "author":
        return <AuthorCard key={`author-${result.data.name}-${index}`} author={result.data} />;
      case "user":
        return <UserCard key={`user-${result.data.odId}`} user={result.data} />;
      case "review":
        return (
          <ReviewCard
            key={`review-${result.data.id}`}
            review={{
              id: result.data.id,
              reviewerName: result.data.reviewerName,
              reviewerUsername: null,
              telegramUserId: result.data.reviewerId,
              reviewText: result.data.text,
              sentiment: result.data.sentiment as "positive" | "negative" | "neutral" | null,
              reviewedAt: result.data.reviewedAt,
              book: result.data.bookId
                ? {
                    id: result.data.bookId,
                    title: result.data.bookTitle || "",
                    author: result.data.bookAuthor,
                    coverUrl: result.data.bookCoverUrl,
                  }
                : null,
            }}
            showBook={true}
            showShareButton={false}
            truncate={true}
          />
        );
      default:
        return null;
    }
  };

  const getEmptyMessage = () => {
    if (!searchQuery) return t("browseBooks.noBooks");
    return t(`search.empty.${activeTab}`);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("browseBooks.title")}</h1>

      <div className="mb-4">
        <SearchBar onSearch={handleSearch} placeholder={t("home.searchPlaceholder")} />
      </div>

      {searchQuery && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-tg-hint">
              {t("browseBooks.resultsFor", { query: searchQuery })}
            </span>
            <button onClick={clearSearch} className="text-sm text-tg-text">
              {t("common.clear")}
            </button>
          </div>

          <div className="mb-4">
            <SearchTabs activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        </>
      )}

      {loading && <Loading />}

      {error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <>
          {searchQuery ? (
            // Search results
            searchResults.length === 0 ? (
              <p className="text-center text-tg-hint py-8">{getEmptyMessage()}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {searchResults.map((result, index) => renderSearchResult(result, index))}

                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-4 py-3 px-4 rounded-lg bg-tg-secondary text-tg-text hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {loadingMore ? t("common.loading") : t("search.loadMore")}
                  </button>
                )}
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
