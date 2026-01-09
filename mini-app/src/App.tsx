import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Reviewer from "./pages/Reviewer";
import Leaderboard from "./pages/Leaderboard";
import ReviewersLeaderboard from "./pages/ReviewersLeaderboard";
import BrowseBooks from "./pages/BrowseBooks";
import FreshReviews from "./pages/FreshReviews";

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initDataUnsafe: {
          start_param?: string;
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
