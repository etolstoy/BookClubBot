import { useEffect, useState, createContext, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { getConfig, type Config } from "./api/client";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Review from "./pages/Review";
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
        HapticFeedback?: {
          impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        };
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
      };
    };
  }
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastHandledParam = useRef<string | null>(null);
  const initialPath = useRef<string | null>(null);
  const navigationDepth = useRef(0);

  // Handle deep link navigation
  const handleDeepLink = (startParam: string) => {
    if (startParam.startsWith("book_")) {
      const bookId = startParam.replace("book_", "");
      navigate(`/book/${bookId}`);
    } else if (startParam.startsWith("review_")) {
      const reviewId = startParam.replace("review_", "");
      navigate(`/review/${reviewId}`);
    } else if (startParam.startsWith("reviewer_")) {
      const userId = startParam.replace("reviewer_", "");
      navigate(`/reviewer/${userId}`);
    } else if (startParam === "leaderboard") {
      navigate("/leaderboard");
    }
  };

  // Initialize Telegram WebApp and handle deep links
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    // Store initial path
    if (initialPath.current === null) {
      initialPath.current = location.pathname;
    }

    // Handle initial deep link
    const startParam = tg.initDataUnsafe?.start_param;
    if (startParam && startParam !== lastHandledParam.current) {
      lastHandledParam.current = startParam;
      handleDeepLink(startParam);
    }

    // Listen for viewport changes (when app regains focus after clicking link)
    const handleViewportChanged = () => {
      const currentParam = tg.initDataUnsafe?.start_param;
      if (currentParam && currentParam !== lastHandledParam.current) {
        lastHandledParam.current = currentParam;
        handleDeepLink(currentParam);
      }
    };

    // Listen for app becoming visible (iOS/Android)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const currentParam = tg.initDataUnsafe?.start_param;
        if (currentParam && currentParam !== lastHandledParam.current) {
          lastHandledParam.current = currentParam;
          handleDeepLink(currentParam);
        }
      }
    };

    // Periodic check for deep link changes (workaround for platforms where start_param updates)
    const checkInterval = setInterval(() => {
      if (!document.hidden) {
        const currentParam = tg.initDataUnsafe?.start_param;
        if (currentParam && currentParam !== lastHandledParam.current) {
          lastHandledParam.current = currentParam;
          handleDeepLink(currentParam);
        }
      }
    }, 500); // Check every 500ms

    // Telegram WebApp viewport event
    if (tg.onEvent) {
      tg.onEvent('viewportChanged', handleViewportChanged);
    }

    // Browser visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(checkInterval);
      if (tg.offEvent) {
        tg.offEvent('viewportChanged', handleViewportChanged);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]); // Re-run if navigate changes

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
    <Routes>
      <Route path="/" element={<Layout><Home /></Layout>} />
      <Route path="/browse" element={<Layout><BrowseBooks /></Layout>} />
      <Route path="/book/:id" element={<Book />} />
      <Route path="/review/:id" element={<Review />} />
      <Route path="/reviewer/:userId" element={<Layout><Reviewer /></Layout>} />
      <Route path="/top-books" element={<Layout><Leaderboard /></Layout>} />
      <Route path="/top-reviewers" element={<Layout><ReviewersLeaderboard /></Layout>} />
      <Route path="/top-authors" element={<Layout><PopularAuthors /></Layout>} />
      <Route path="/author/:author" element={<Layout><AuthorBooks /></Layout>} />
      <Route path="/fresh-reviews" element={<Layout><FreshReviews /></Layout>} />
      {/* Legacy route for backward compatibility */}
      <Route path="/leaderboard" element={<Layout><Leaderboard /></Layout>} />
    </Routes>
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
