import { useEffect, useState, createContext } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { getConfig, type Config } from "./api/client";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Reviewer from "./pages/Reviewer";
import Leaderboard from "./pages/Leaderboard";
import ReviewersLeaderboard from "./pages/ReviewersLeaderboard";
import BrowseBooks from "./pages/BrowseBooks";
import FreshReviews from "./pages/FreshReviews";

// Create context for config
export const ConfigContext = createContext<Config | null>(null);

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string; // Raw signed initData string
        initDataUnsafe: {
          start_param?: string;
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
      };
    };
  }
}

function AppContent() {
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();

      // Handle deep links
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam) {
        if (startParam.startsWith("book_")) {
          const bookId = startParam.replace("book_", "");
          navigate(`/book/${bookId}`);
        } else if (startParam.startsWith("reviewer_")) {
          const userId = startParam.replace("reviewer_", "");
          navigate(`/reviewer/${userId}`);
        } else if (startParam === "leaderboard") {
          navigate("/leaderboard");
        }
      }
    }
  }, [navigate]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<BrowseBooks />} />
        <Route path="/book/:id" element={<Book />} />
        <Route path="/reviewer/:userId" element={<Reviewer />} />
        <Route path="/top-books" element={<Leaderboard />} />
        <Route path="/top-reviewers" element={<ReviewersLeaderboard />} />
        <Route path="/fresh-reviews" element={<FreshReviews />} />
        {/* Legacy route for backward compatibility */}
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    // Load config on startup
    getConfig().then(setConfig).catch(console.error);
  }, []);

  return (
    <ConfigContext.Provider value={config}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ConfigContext.Provider>
  );
}
