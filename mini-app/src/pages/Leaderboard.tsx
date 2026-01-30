import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getLast30DaysBookLeaderboard,
  getLast365DaysBookLeaderboard,
  getBookLeaderboard,
  type BookLeaderboardEntry,
} from "../api/client";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import PaginationControl from "../components/PaginationControl";
import { useTranslation } from "../i18n/index.js";
import { usePagination } from "../hooks/usePagination";
import { getRankEmoji } from "../lib/rankUtils";

type Tab = "overall" | "last30days" | "last365days";

export default function Leaderboard() {
  const navigate = useNavigate();
  const { t, plural } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const tabParam = searchParams.get("tab");
    return (tabParam === "last30days" || tabParam === "last365days") ? tabParam : "overall";
  });
  const { page, hasMore, setHasMore, handlePrevPage, handleNextPage, itemsPerPage, resetToFirstPage } = usePagination({ additionalParams: { tab } });
  const [last30DaysData, setLast30DaysData] = useState<BookLeaderboardEntry[]>([]);
  const [last365DaysData, setLast365DaysData] = useState<BookLeaderboardEntry[]>([]);
  const [overallData, setOverallData] = useState<BookLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * itemsPerPage;
        let data: BookLeaderboardEntry[];

        if (tab === "last30days") {
          const result = await getLast30DaysBookLeaderboard({
            limit: itemsPerPage,
            offset
          });
          data = result.leaderboard;
          setLast30DaysData(data);
        } else if (tab === "last365days") {
          const result = await getLast365DaysBookLeaderboard({
            limit: itemsPerPage,
            offset
          });
          data = result.leaderboard;
          setLast365DaysData(data);
        } else {
          const result = await getBookLeaderboard({
            limit: itemsPerPage,
            offset
          });
          data = result.leaderboard;
          setOverallData(data);
        }

        setHasMore(data.length === itemsPerPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadLeaderboard"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [tab, page]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    resetToFirstPage();
    setSearchParams({ tab: newTab, page: "1" });
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const currentData = tab === "last30days" ? last30DaysData : tab === "last365days" ? last365DaysData : overallData;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-tg-text mb-4">{t("leaderboard.topBooks")}</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => handleTabChange("overall")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "overall"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("leaderboard.tabs.overall")}
        </button>
        <button
          onClick={() => handleTabChange("last30days")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last30days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("leaderboard.tabs.last30days")}
        </button>
        <button
          onClick={() => handleTabChange("last365days")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === "last365days"
              ? "bg-[#3D3D3D] text-white"
              : "bg-tg-secondary text-tg-hint"
          }`}
        >
          {t("leaderboard.tabs.last365days")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {currentData.length === 0 ? (
          <p className="text-center text-tg-hint py-4">{t("leaderboard.noBooks")}</p>
        ) : (
          currentData.map((entry) => (
            <div
              key={entry.bookId}
              onClick={() => navigate(`/book/${entry.bookId}`)}
              className="flex items-center gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className="w-8 text-center text-lg">{getRankEmoji(entry.rank)}</span>
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
                {plural("plurals.reviews", entry.reviewCount)}
              </span>
            </div>
          ))
        )}
      </div>

      {currentData.length > 0 && (
        <PaginationControl
          page={page}
          hasMore={hasMore}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
        />
      )}
    </div>
  );
}
