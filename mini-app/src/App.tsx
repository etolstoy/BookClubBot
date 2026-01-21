import { useEffect, useState, createContext, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { getConfig, type Config } from "./api/client";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Reviewer from "./pages/Reviewer";
import Leaderboard from "./pages/Leaderboard";
import ReviewersLeaderboard from "./pages/ReviewersLeaderboard";
import BrowseBooks from "./pages/BrowseBooks";
import FreshReviews from "./pages/FreshReviews";
import PopularAuthors from "./pages/PopularAuthors.js";
import AuthorBooks from "./pages/AuthorBooks.js";

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
  const location = useLocation();
  const deepLinkHandled = useRef(false);
  const initialPath = useRef<string | null>(null);
  const navigationDepth = useRef(0);

  // Initialize Telegram WebApp and handle deep links (only once)
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    // Store initial path
    if (initialPath.current === null) {
      initialPath.current = location.pathname;
    }

    // Handle deep links only once
    if (!deepLinkHandled.current) {
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam) {
        deepLinkHandled.current = true;

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
  }, []); // Run only once on mount

  // Track navigation depth
  useEffect(() => {
    navigationDepth.current++;
  }, [location.pathname]);

  // Manage Telegram BackButton based on current route
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return;

    const isHomePage = location.pathname === "/";

    if (isHomePage) {
      // Hide back button on home page
      tg.BackButton.hide();
    } else {
      // Show back button on all other pages
      tg.BackButton.show();

      // Handle back button click
      const handleBackClick = () => {
        // If we've navigated within the app (depth > 1), use history back
        // Otherwise, go to home page
        if (navigationDepth.current > 1 && location.pathname !== initialPath.current) {
          navigate(-1);
        } else {
          navigate("/");
        }
      };

      tg.BackButton.onClick(handleBackClick);

      // Cleanup
      return () => {
        tg.BackButton.offClick(handleBackClick);
      };
    }
  }, [location.pathname, navigate]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<BrowseBooks />} />
        <Route path="/book/:id" element={<Book />} />
        <Route path="/reviewer/:userId" element={<Reviewer />} />
        <Route path="/top-books" element={<Leaderboard />} />
        <Route path="/top-reviewers" element={<ReviewersLeaderboard />} />
        <Route path="/top-authors" element={<PopularAuthors />} />
        <Route path="/author/:author" element={<AuthorBooks />} />
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
