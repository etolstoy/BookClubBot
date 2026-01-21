import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getReviewersLeaderboard,
  getLast30DaysReviewersLeaderboard,
  getLast365DaysReviewersLeaderboard,
  type LeaderboardEntry,
} from "../api/client";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useTranslation } from "../i18n/index.js";

type Tab = "overall" | "last30days" | "last365days";

export default function ReviewersLeaderboard() {
  const navigate = useNavigate();
  const { t, plural } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const tabParam = searchParams.get("tab");
    return (tabParam === "last30days" || tabParam === "last365days") ? tabParam : "overall";
  });
  const [overallData, setOverallData] = useState<LeaderboardEntry[]>([]);
  const [last30DaysData, setLast30DaysData] = useState<LeaderboardEntry[]>([]);
  const [last365DaysData, setLast365DaysData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [overall, last30days, last365days] = await Promise.all([
          getReviewersLeaderboard(20),
          getLast30DaysReviewersLeaderboard(20),
          getLast365DaysReviewersLeaderboard(20),
        ]);

        setOverallData(overall.leaderboard);
        setLast30DaysData(last30days.leaderboard);
        setLast365DaysData(last365days.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadLeaderboard"));
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

  const currentData = tab === "overall" ? overallData : tab === "last30days" ? last30DaysData : last365DaysData;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("reviewersLeaderboard.topReviewers")}</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => {
            setTab("overall");
            setSearchParams({ tab: "overall" });
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "overall"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.overall")}
        </button>
        <button
          onClick={() => {
            setTab("last30days");
            setSearchParams({ tab: "last30days" });
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last30days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.last30days")}
        </button>
        <button
          onClick={() => {
            setTab("last365days");
            setSearchParams({ tab: "last365days" });
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last365days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.last365days")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {currentData.length === 0 ? (
          <p className="text-center text-tg-hint py-4">{t("reviewersLeaderboard.noReviews")}</p>
        ) : (
          currentData.map((entry) => (
            <div
              key={entry.telegramUserId}
              onClick={() => navigate(`/reviewer/${entry.telegramUserId}`)}
              className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className="w-8 text-center text-lg">{getMedal(entry.rank)}</span>
              <div className="flex-1">
                <span className="font-medium text-tg-text">
                  {entry.displayName || entry.username || t("common.anonymous")}
                </span>
              </div>
              <span className="text-tg-hint">
                {plural("plurals.reviews", entry.reviewCount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
