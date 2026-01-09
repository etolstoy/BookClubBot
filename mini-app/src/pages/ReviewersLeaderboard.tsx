import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getMonthlyReviewersLeaderboard,
  getYearlyReviewersLeaderboard,
  getReviewersLeaderboard,
  type LeaderboardEntry,
} from "../api/client";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

type Tab = "monthly" | "yearly" | "overall";

export default function ReviewersLeaderboard() {
  const [tab, setTab] = useState<Tab>("monthly");
  const [monthlyData, setMonthlyData] = useState<LeaderboardEntry[]>([]);
  const [yearlyData, setYearlyData] = useState<LeaderboardEntry[]>([]);
  const [overallData, setOverallData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [monthly, yearly, overall] = await Promise.all([
          getMonthlyReviewersLeaderboard({ limit: 20 }),
          getYearlyReviewersLeaderboard({ limit: 20 }),
          getReviewersLeaderboard(20),
        ]);

        setMonthlyData(monthly.leaderboard);
        setYearlyData(yearly.leaderboard);
        setOverallData(overall.leaderboard);
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

  const currentData = tab === "monthly" ? monthlyData : tab === "yearly" ? yearlyData : overallData;

  return (
    <div className="p-4">
      <Link to="/" className="text-tg-link hover:underline mb-4 inline-block">
        &larr; Back to home
      </Link>

      <h1 className="text-2xl font-bold text-tg-text mb-4">Top Reviewers</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("monthly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "monthly"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          This Month
        </button>
        <button
          onClick={() => setTab("yearly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "yearly"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          This Year
        </button>
        <button
          onClick={() => setTab("overall")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "overall"
              ? "bg-tg-button text-tg-button-text"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          Overall
        </button>
      </div>

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
    </div>
  );
}
