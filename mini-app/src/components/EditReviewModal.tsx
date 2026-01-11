import { useState, useEffect } from "react";
import {
  searchBooks,
  searchGoogleBooks,
  updateReview,
  type Book,
  type GoogleBook,
  type SelectedBook,
  type Review,
  type UpdateReviewInput,
  isDatabaseBook,
  isGoogleBook,
} from "../api/client";
import { useTranslation } from "../i18n/index.js";

interface EditReviewModalProps {
  review: Review;
  onClose: () => void;
  onSuccess: (updatedReview: Review) => void;
}

export default function EditReviewModal({
  review,
  onClose,
  onSuccess,
}: EditReviewModalProps) {
  const { t } = useTranslation();
  const [reviewText, setReviewText] = useState(review.reviewText);
  const [sentiment, setSentiment] = useState<
    "positive" | "negative" | "neutral" | null
  >(review.sentiment);
  const [selectedBook, setSelectedBook] = useState<SelectedBook | null>(
    (review.book as SelectedBook) || null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [databaseResults, setDatabaseResults] = useState<Book[]>([]);
  const [googleBooksResults, setGoogleBooksResults] = useState<GoogleBook[]>(
    []
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [googleBooksLoading, setGoogleBooksLoading] = useState(false);
  const [showGoogleBooksButton, setShowGoogleBooksButton] = useState(false);
  const [googleBooksSearched, setGoogleBooksSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBookSearch, setShowBookSearch] = useState(false);

  const handleDatabaseSearch = async (query: string) => {
    if (!query.trim()) {
      setDatabaseResults([]);
      setGoogleBooksResults([]);
      setShowGoogleBooksButton(false);
      setGoogleBooksSearched(false);
      return;
    }

    setSearchLoading(true);
    setGoogleBooksSearched(false);
    setGoogleBooksResults([]);

    try {
      const result = await searchBooks(query);
      setDatabaseResults(result.books);

      // Always show Google Books button after database search completes
      setShowGoogleBooksButton(true);
    } catch (err) {
      console.error("Database search error:", err);
      setDatabaseResults([]);
      setShowGoogleBooksButton(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleGoogleBooksSearch = async () => {
    if (!searchQuery.trim() || googleBooksSearched) return;

    setGoogleBooksLoading(true);

    try {
      const result = await searchGoogleBooks(searchQuery);
      setGoogleBooksResults(result.books);
      setGoogleBooksSearched(true);
    } catch (err) {
      console.error("Google Books search error:", err);
      setError(t("editReview.errors.googleBooksSearchFailed"));
      setGoogleBooksResults([]);
    } finally {
      setGoogleBooksLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        handleDatabaseSearch(searchQuery);
      }
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSave = async () => {
    if (!reviewText.trim()) {
      setError(t("editReview.errors.emptyText"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData: UpdateReviewInput = {};

      // Check what changed
      if (reviewText !== review.reviewText) {
        updateData.reviewText = reviewText;
      }

      if (sentiment !== review.sentiment) {
        updateData.sentiment = sentiment || undefined;
      }

      // Handle book assignment
      if (selectedBook) {
        if (isDatabaseBook(selectedBook)) {
          // Book already exists in database
          if (selectedBook.id !== review.book?.id) {
            updateData.bookId = selectedBook.id;
          }
        } else if (isGoogleBook(selectedBook)) {
          // Book is from Google Books - send data for server to create
          const currentBookGoogleId =
            review.book && "googleBooksId" in review.book
              ? (review.book as any).googleBooksId
              : null;
          if (selectedBook.googleBooksId !== currentBookGoogleId) {
            updateData.googleBooksData = selectedBook;
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        onClose();
        return;
      }

      const result = await updateReview(review.id, updateData);
      onSuccess(result.review);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("editReview.errors.saveFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-tg-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-tg-secondary sticky top-0 bg-tg-bg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-tg-text">
              {t("editReview.title")}
            </h2>
            <button
              onClick={onClose}
              className="text-tg-hint hover:text-tg-text"
              disabled={saving}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500 bg-opacity-20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Review Text */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              {t("editReview.reviewText")}
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none resize-none"
              rows={6}
              placeholder={t("editReview.reviewTextPlaceholder")}
              disabled={saving}
            />
          </div>

          {/* Sentiment Selector */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              {t("editReview.sentiment")}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSentiment("positive")}
                className={`flex-1 p-3 rounded-[16px] border-2 transition-colors ${
                  sentiment === "positive"
                    ? "border-green-500 bg-green-500 bg-opacity-20"
                    : "border-tg-secondary bg-tg-secondary"
                }`}
                disabled={saving}
              >
                <div className="text-2xl">👍</div>
                <div className="text-xs text-tg-hint mt-1">
                  {t("sentiment.positive")}
                </div>
              </button>
              <button
                onClick={() => setSentiment("neutral")}
                className={`flex-1 p-3 rounded-[16px] border-2 transition-colors ${
                  sentiment === "neutral"
                    ? "border-yellow-500 bg-yellow-500 bg-opacity-20"
                    : "border-tg-secondary bg-tg-secondary"
                }`}
                disabled={saving}
              >
                <div className="text-2xl">😐</div>
                <div className="text-xs text-tg-hint mt-1">
                  {t("sentiment.neutral")}
                </div>
              </button>
              <button
                onClick={() => setSentiment("negative")}
                className={`flex-1 p-3 rounded-[16px] border-2 transition-colors ${
                  sentiment === "negative"
                    ? "border-red-500 bg-red-500 bg-opacity-20"
                    : "border-tg-secondary bg-tg-secondary"
                }`}
                disabled={saving}
              >
                <div className="text-2xl">👎</div>
                <div className="text-xs text-tg-hint mt-1">
                  {t("sentiment.negative")}
                </div>
              </button>
            </div>
          </div>

          {/* Book Assignment */}
          <div>
            <label className="block text-sm font-medium text-tg-text mb-2">
              {t("editReview.book")}
            </label>

            {selectedBook ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary">
                {selectedBook.coverUrl && (
                  <img
                    src={selectedBook.coverUrl}
                    alt={selectedBook.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <div className="font-medium text-tg-text">
                    {selectedBook.title}
                  </div>
                  {selectedBook.author && (
                    <div className="text-sm text-tg-hint">
                      {selectedBook.author}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowBookSearch(true)}
                  className="text-sm text-tg-link no-underline"
                  disabled={saving}
                >
                  {t("editReview.changeBook")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBookSearch(true)}
                className="w-full p-3 rounded-[16px] bg-tg-secondary text-tg-link hover:bg-opacity-80 transition-colors"
                disabled={saving}
              >
                {t("editReview.selectBook")}
              </button>
            )}
          </div>

          {/* Book Search */}
          {showBookSearch && (
            <div className="border-t border-tg-secondary pt-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("editReview.searchBookPlaceholder")}
                className="w-full p-3 rounded-lg bg-tg-secondary text-tg-text border-none outline-none mb-3"
                disabled={saving}
              />

              {/* Database Search Loading */}
              {searchLoading && (
                <div className="text-center text-tg-hint py-4">
                  {t("editReview.searchingDatabase")}
                </div>
              )}

              {/* Database Results */}
              {!searchLoading &&
                databaseResults.length > 0 &&
                !googleBooksSearched && (
                  <>
                    <div className="text-xs text-tg-hint mb-2">
                      {t("editReview.databaseResults")}
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                      {databaseResults.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => {
                            setSelectedBook(book);
                            setShowBookSearch(false);
                            setSearchQuery("");
                            setDatabaseResults([]);
                            setGoogleBooksResults([]);
                            setGoogleBooksSearched(false);
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg bg-tg-secondary hover:bg-opacity-80 transition-colors text-left"
                          disabled={saving}
                        >
                          {book.coverUrl && (
                            <img
                              src={book.coverUrl}
                              alt={book.title}
                              className="w-10 h-14 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-tg-text text-sm">
                              {book.title}
                            </div>
                            {book.author && (
                              <div className="text-xs text-tg-hint">
                                {book.author}
                              </div>
                            )}
                            <div className="text-xs text-tg-hint">
                              {t("editReview.inOurDatabase")}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

              {/* Google Books Button */}
              {showGoogleBooksButton &&
                !googleBooksSearched &&
                searchQuery.trim() && (
                  <button
                    onClick={handleGoogleBooksSearch}
                    disabled={googleBooksLoading || saving}
                    className="w-full p-3 rounded-[16px] bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors disabled:opacity-50 mb-3 border-2 border-transparent"
                  >
                    {googleBooksLoading
                      ? t("editReview.searchingGoogleBooks")
                      : t("editReview.searchGoogleBooks")}
                  </button>
                )}

              {/* Google Books Results */}
              {googleBooksSearched && googleBooksResults.length > 0 && (
                <>
                  <div className="text-xs text-tg-hint mb-2">
                    {t("editReview.googleBooksResults")}
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                    {googleBooksResults.map((book) => (
                      <button
                        key={book.googleBooksId}
                        onClick={() => {
                          setSelectedBook(book);
                          setShowBookSearch(false);
                          setSearchQuery("");
                          setDatabaseResults([]);
                          setGoogleBooksResults([]);
                          setGoogleBooksSearched(false);
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg bg-tg-secondary hover:bg-opacity-80 transition-colors text-left"
                        disabled={saving}
                      >
                        {book.coverUrl && (
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="w-10 h-14 object-cover rounded"
                          />
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-tg-text text-sm">
                            {book.title}
                          </div>
                          {book.author && (
                            <div className="text-xs text-tg-hint">
                              {book.author}
                            </div>
                          )}
                          <div className="text-xs text-tg-link">
                            {t("editReview.fromGoogleBooks")}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* No Results Messages */}
              {!searchLoading &&
                !googleBooksLoading &&
                searchQuery &&
                databaseResults.length === 0 &&
                !googleBooksSearched && (
                  <div className="text-center text-tg-hint py-4">
                    {t("editReview.noBookResults")}
                  </div>
                )}

              {googleBooksSearched && googleBooksResults.length === 0 && (
                <div className="text-center text-tg-hint py-4">
                  {t("editReview.noGoogleBooksResults")}
                </div>
              )}

              <button
                onClick={() => {
                  setShowBookSearch(false);
                  setSearchQuery("");
                  setDatabaseResults([]);
                  setGoogleBooksResults([]);
                  setGoogleBooksSearched(false);
                }}
                className="mt-3 text-sm text-tg-hint hover:text-tg-text no-underline"
                disabled={saving}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-tg-secondary flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-[16px] bg-tg-secondary text-tg-text hover:bg-opacity-80 transition-colors"
            disabled={saving}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 rounded-[16px] bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors disabled:opacity-50 border-2 border-transparent"
            disabled={saving || !reviewText.trim()}
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
