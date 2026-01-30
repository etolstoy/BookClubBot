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
import VolunteerScreen from "./pages/VolunteerScreen";

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
  const deepLinkHandled = useRef(false);
  const deepLinkPage = useRef<string | null>(null);

  // Initialize Telegram WebApp and handle initial deep link
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    // Handle deep link on app launch only (Telegram doesn't update start_param while app is open)
    const startParam = tg.initDataUnsafe?.start_param;

    // Only handle deep link once on initial mount
    if (startParam && !deepLinkHandled.current) {
      deepLinkHandled.current = true;

      let targetPath = "";
      if (startParam.startsWith("book_")) {
        const bookId = startParam.replace("book_", "");
        targetPath = `/book/${bookId}`;
      } else if (startParam.startsWith("review_")) {
        const reviewId = startParam.replace("review_", "");
        targetPath = `/review/${reviewId}`;
      } else if (startParam.startsWith("reviewer_")) {
        const userId = startParam.replace("reviewer_", "");
        targetPath = `/reviewer/${userId}`;
      } else if (startParam === "leaderboard") {
        targetPath = "/leaderboard";
      }

      if (targetPath) {
        deepLinkPage.current = targetPath;
        navigate(targetPath);
      }
    }
  }, []); // Run only once on mount

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
        // If we're still on the initial deep link page, always go to home
        if (deepLinkPage.current && location.pathname === deepLinkPage.current) {
          navigate("/");
        } else {
          // Have navigated away from initial page, use browser back
          navigate(-1);
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
      <Route path="/volunteer" element={<Layout><VolunteerScreen /></Layout>} />
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
