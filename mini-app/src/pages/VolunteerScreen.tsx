import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getBooksNeedingHelp,
  getReviewsNeedingHelp,
  getVolunteerStats,
  getBook,
  type Book,
  type BookDetail,
  type Review,
} from "../api/client";
import BookCard from "../components/BookCard";
import ReviewCard from "../components/ReviewCard";
import EditBookModal from "../components/EditBookModal";
import EditReviewModal from "../components/EditReviewModal";

const ITEMS_PER_PAGE = 20;

type VolunteerItem =
  | { type: "book"; data: Book; missingFields: string[] }
  | { type: "review"; data: Review; missingFields: string[] };

export default function VolunteerScreen() {
  const [items, setItems] = useState<VolunteerItem[]>([]);
  const [totalBooksNeedingHelp, setTotalBooksNeedingHelp] = useState(0);
  const [totalReviewsNeedingHelp, setTotalReviewsNeedingHelp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Edit modals
  const [editingBook, setEditingBook] = useState<BookDetail | null>(null);
  const [editingReview, setEditingReview] = useState<Review | null>(null);

  useEffect(() => {
    loadItems();
  }, [page]);

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);

      const [booksResult, reviewsResult, stats] = await Promise.all([
        getBooksNeedingHelp({ limit: 1000, offset: 0 }),
        getReviewsNeedingHelp({ limit: 1000, offset: 0 }),
        getVolunteerStats(),
      ]);

      // Store totals from stats
      setTotalBooksNeedingHelp(stats.booksNeedingHelp);
      setTotalReviewsNeedingHelp(stats.reviewsNeedingHelp);

      // Map books with missing fields
      const bookItems: VolunteerItem[] = booksResult.books.map((book) => {
        const missingFields: string[] = [];
        if (!book.coverUrl) missingFields.push("coverUrl");
        if (!book.author) missingFields.push("author");
        if (!book.goodreadsUrl) missingFields.push("goodreadsUrl");
        return { type: "book", data: book, missingFields };
      });

      // Map reviews with missing fields
      const reviewItems: VolunteerItem[] = reviewsResult.reviews.map(
        (review) => ({
          type: "review",
          data: review,
          missingFields: ["book"],
        })
      );

      // Combine and sort
      const combined = [...bookItems, ...reviewItems];

      // Sort by: reviews first (by date) -> then books (by popularity -> missing fields -> date)
      combined.sort((a, b) => {
        // 0. Orphaned reviews always come first
        if (a.type === "review" && b.type === "book") {
          return -1; // Review comes before book
        }
        if (a.type === "book" && b.type === "review") {
          return 1; // Book comes after review
        }

        // If both are reviews, sort by date (most recent first)
        if (a.type === "review" && b.type === "review") {
          const dateA = new Date(a.data.reviewedAt).getTime();
          const dateB = new Date(b.data.reviewedAt).getTime();
          return dateB - dateA;
        }

        // If both are books, sort by: popularity -> missing fields -> date
        if (a.type === "book" && b.type === "book") {
          // 1. Sort by popularity (review count)
          const popularityA = a.data.reviewCount;
          const popularityB = b.data.reviewCount;
          if (popularityA !== popularityB) {
            return popularityB - popularityA; // Higher is better
          }

          // 2. Sort by missing fields count (more missing = higher priority)
          const missingCountA = a.missingFields.length;
          const missingCountB = b.missingFields.length;
          if (missingCountA !== missingCountB) {
            return missingCountB - missingCountA; // More missing is higher priority
          }

          // 3. Sort by date (most recent first)
          const dateA = a.data.lastReviewedAt ? new Date(a.data.lastReviewedAt).getTime() : 0;
          const dateB = b.data.lastReviewedAt ? new Date(b.data.lastReviewedAt).getTime() : 0;
          return dateB - dateA; // More recent is better
        }

        return 0;
      });

      // Paginate client-side
      const start = page * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const paginated = combined.slice(start, end);

      setItems(paginated);
      setHasMore(end < combined.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }

  function handleBookUpdated() {
    // Refresh items after book update
    loadItems();
    setEditingBook(null);
  }

  function handleReviewUpdated() {
    // Refresh items after review update
    loadItems();
    setEditingReview(null);
  }

  if (loading && page === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-tg-hint">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-tg-text mb-2">
        Волонтёрская помощь
      </h1>
      <p className="text-sm text-tg-hint mb-6">
        Нужна помощь: {totalBooksNeedingHelp} книг и {totalReviewsNeedingHelp} рецензий
      </p>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={`${item.type}-${index}`}>
            {item.type === "book" ? (
              <BookCard
                book={item.data}
                missingFields={item.missingFields}
                onEdit={async () => {
                  const result = await getBook(item.data.id);
                  setEditingBook(result.book);
                }}
              />
            ) : (
              <ReviewCard
                review={item.data}
                missingFields={item.missingFields}
                onEdit={() => setEditingReview(item.data)}
              />
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 bg-tg-button text-white rounded"
          >
            Показать ещё
          </button>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="text-center text-tg-hint mt-8">
          <p>Всё в порядке! Помощь не нужна.</p>
          <Link to="/" className="text-tg-button underline mt-2 inline-block">
            Вернуться на главную
          </Link>
        </div>
      )}

      {editingBook && (
        <EditBookModal
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onSuccess={handleBookUpdated}
        />
      )}

      {editingReview && (
        <EditReviewModal
          review={editingReview}
          onClose={() => setEditingReview(null)}
          onSuccess={handleReviewUpdated}
        />
      )}
    </div>
  );
}
