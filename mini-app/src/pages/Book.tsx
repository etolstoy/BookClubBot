import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getBook, type BookDetail, type Review } from "../api/client";
import ReviewCard from "../components/ReviewCard";
import SentimentBadge from "../components/SentimentBadge";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

export default function Book() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function loadBook() {
      setLoading(true);
      setError(null);

      try {
        const result = await getBook(parseInt(id!, 10));
        setBook(result.book);
        setReviews(result.reviews);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load book");
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!book) return <ErrorMessage message="Book not found" />;

  const filteredReviews = sentimentFilter
    ? reviews.filter((r) => r.sentiment === sentimentFilter)
    : reviews;

  const { positive, negative, neutral } = book.sentiments;

  return (
    <div className="p-4">
      <Link to="/" className="text-tg-link hover:underline mb-4 inline-block">
        &larr; Back to catalog
      </Link>

      <div className="flex gap-4 mb-6">
        <div className="w-24 h-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm text-center p-2">
              No cover
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-xl font-bold text-tg-text">{book.title}</h1>
          {book.author && (
            <p className="text-tg-hint mt-1">by {book.author}</p>
          )}
          {book.publicationYear && (
            <p className="text-sm text-tg-hint">{book.publicationYear}</p>
          )}
          {book.pageCount && (
            <p className="text-sm text-tg-hint">{book.pageCount} pages</p>
          )}
        </div>
      </div>

      {book.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {book.genres.map((genre) => (
            <span
              key={genre}
              className="text-xs px-3 py-1 rounded-full bg-tg-secondary text-tg-hint"
            >
              {genre}
            </span>
          ))}
        </div>
      )}

      {book.description && (
        <div className="mb-6">
          <h2 className="font-semibold text-tg-text mb-2">Description</h2>
          <p className="text-sm text-tg-hint whitespace-pre-wrap">
            {book.description}
          </p>
        </div>
      )}

      {(book.googleBooksUrl || book.goodreadsUrl) && (
        <div className="flex flex-col gap-2 mb-6">
          {book.googleBooksUrl && (
            <a
              href={book.googleBooksUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-tg-link hover:underline"
            >
              View on Google Books &rarr;
            </a>
          )}
          {book.goodreadsUrl && (
            <a
              href={book.goodreadsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-tg-link hover:underline"
            >
              View on Goodreads &rarr;
            </a>
          )}
        </div>
      )}

      <div className="mb-4">
        <h2 className="font-semibold text-tg-text mb-2">
          Reviews ({book.reviewCount})
        </h2>

        <div className="flex gap-2 mb-3 flex-wrap">
          <button
            onClick={() => setSentimentFilter(null)}
            className={`px-3 py-1 rounded-full text-sm ${
              !sentimentFilter
                ? "bg-tg-button text-tg-button-text"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            All ({book.reviewCount})
          </button>
          <button
            onClick={() => setSentimentFilter("positive")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
              sentimentFilter === "positive"
                ? "bg-tg-button text-tg-button-text"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="positive" /> ({positive})
          </button>
          <button
            onClick={() => setSentimentFilter("negative")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
              sentimentFilter === "negative"
                ? "bg-tg-button text-tg-button-text"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="negative" /> ({negative})
          </button>
          <button
            onClick={() => setSentimentFilter("neutral")}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${
              sentimentFilter === "neutral"
                ? "bg-tg-button text-tg-button-text"
                : "bg-tg-secondary text-tg-hint"
            }`}
          >
            <SentimentBadge sentiment="neutral" /> ({neutral})
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filteredReviews.length === 0 ? (
          <p className="text-center text-tg-hint py-4">No reviews found</p>
        ) : (
          filteredReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))
        )}
      </div>
    </div>
  );
}
