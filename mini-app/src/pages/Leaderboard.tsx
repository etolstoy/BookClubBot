import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getMonthlyLeaderboard,
  getYearlyLeaderboard,
  getBookLeaderboard,
  type LeaderboardEntry,
  type BookLeaderboardEntry,
} from "../api/client";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

type Tab = "monthly" | "yearly" | "books";

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>("monthly");
  const [monthlyData, setMonthlyData] = useState<LeaderboardEntry[]>([]);
  const [yearlyData, setYearlyData] = useState<LeaderboardEntry[]>([]);
  const [booksData, setBooksData] = useState<BookLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [monthly, yearly, books] = await Promise.all([
          getMonthlyLeaderboard({ limit: 20 }),
          getYearlyLeaderboard({ limit: 20 }),
          getBookLeaderboard(20),
        ]);

        setMonthlyData(monthly.leaderboard);
        setYearlyData(yearly.leaderboard);
        setBooksData(books.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const getMedal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}.`;
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const currentData = tab === "monthly" ? monthlyData : tab === "yearly" ? yearlyData : null;

  return (
    <div className="p-4">
      <Link to="/" className="text-tg-link hover:underline mb-4 inline-block">
        &larr; Back to catalog
      </Link>

      <h1 className="text-2xl font-bold text-tg-text mb-4">Leaderboards</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("monthly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "monthly"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setTab("yearly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "yearly"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          Yearly
        </button>
        <button
          onClick={() => setTab("books")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "books"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          Top Books
        </button>
      </div>

      {tab !== "books" && currentData && (
        <div className="flex flex-col gap-2">
          {currentData.length === 0 ? (
            <p className="text-center text-tg-hint py-4">No reviews yet</p>
          ) : (
            currentData.map((entry) => (
              <Link
                key={entry.telegramUserId}
                to={`/reviewer/${entry.telegramUserId}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity"
              >
                <span className="w-8 text-center text-lg">{getMedal(entry.rank)}</span>
                <div className="flex-1">
                  <span className="font-medium text-tg-text">
                    {entry.displayName || entry.username || "Anonymous"}
                  </span>
                </div>
                <span className="text-tg-hint">
                  {entry.reviewCount} review{entry.reviewCount !== 1 ? "s" : ""}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "books" && (
        <div className="flex flex-col gap-2">
          {booksData.length === 0 ? (
            <p className="text-center text-tg-hint py-4">No books yet</p>
          ) : (
            booksData.map((entry) => (
              <Link
                key={entry.bookId}
                to={`/book/${entry.bookId}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity"
              >
                <span className="w-8 text-center text-lg">{getMedal(entry.rank)}</span>
                {entry.coverUrl && (
                  <img
                    src={entry.coverUrl}
                    alt={entry.title}
                    className="w-10 h-14 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-tg-text truncate">{entry.title}</div>
                  {entry.author && (
                    <div className="text-sm text-tg-hint truncate">{entry.author}</div>
                  )}
                </div>
                <span className="text-tg-hint">
                  {entry.reviewCount} review{entry.reviewCount !== 1 ? "s" : ""}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
