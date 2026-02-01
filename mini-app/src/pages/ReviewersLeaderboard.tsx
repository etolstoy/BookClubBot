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
import { getRankEmoji } from "../lib/rankUtils";

type Tab = "overall" | "last30days" | "last365days";

export default function ReviewersLeaderboard() {
  const navigate = useNavigate();
  const { t, plural } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current tab from URL params
  const tabParam = searchParams.get("tab");
  const tab: Tab = (tabParam === "last30days" || tabParam === "last365days") ? tabParam : "overall";

  // Fetch data whenever tab changes
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        let response;
        if (tab === "last30days") {
          response = await getLast30DaysReviewersLeaderboard(20);
        } else if (tab === "last365days") {
          response = await getLast365DaysReviewersLeaderboard(20);
        } else {
          response = await getReviewersLeaderboard(20);
        }

        setData(response.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadLeaderboard"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [tab]); // Refetch when tab changes

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("reviewersLeaderboard.topReviewers")}</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSearchParams({ tab: "overall" })}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "overall"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.overall")}
        </button>
        <button
          onClick={() => setSearchParams({ tab: "last30days" })}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last30days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.last30days")}
        </button>
        <button
          onClick={() => setSearchParams({ tab: "last365days" })}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last365days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("reviewersLeaderboard.tabs.last365days")}
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <div className="flex flex-col gap-2">
          {data.length === 0 ? (
            <p className="text-center text-tg-hint py-4">{t("reviewersLeaderboard.noReviews")}</p>
          ) : (
            data.map((entry) => (
              <div
                key={entry.telegramUserId}
                onClick={() => navigate(`/reviewer/${entry.telegramUserId}`)}
                className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="w-8 text-center text-lg">{getRankEmoji(entry.rank)}</span>
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
      )}
    </div>
  );
}
