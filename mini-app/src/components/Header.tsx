import { useNavigate, useLocation, Link } from "react-router-dom";
import ShareButton from "./ShareButton.js";
import Avatar from "./Avatar.js";
import { TABBED_ROUTES } from "../lib/routes.js";

interface HeaderProps {
  shareUrl?: string;
}

export default function Header({ shareUrl }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isHomePage = location.pathname === "/";

  // Show back button on all screens except homepage
  const showBackButton = !isHomePage;

  // Get current user from Telegram WebApp
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  const handleBack = () => {
    // If on tabbed screen, always go home
    if (TABBED_ROUTES.includes(location.pathname as any)) {
      navigate("/");
      return;
    }

    // Use browser history if available, otherwise go home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-tg-bg sticky top-0 z-50 border-b border-tg-secondary">
      <div className="flex items-center gap-2">
        {showBackButton && (
          <button
            onClick={handleBack}
            className="text-tg-text hover:opacity-80 transition-opacity mr-2"
            aria-label="Back"
          >
            <span className="text-xl">←</span>
          </button>
        )}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img src="/logo.png" alt="Вастрик.Книги" className="h-6 w-6" />
          <span className="text-lg font-bold text-tg-text">Вастрик.Книги</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        {shareUrl && <ShareButton url={shareUrl} />}
        {tgUser && (
          <Link
            to={`/reviewer/${tgUser.id}`}
            className="hover:opacity-80 transition-opacity"
            aria-label="My profile"
          >
            <Avatar
              userId={String(tgUser.id)}
              firstName={tgUser.first_name || "U"}
              lastName={tgUser.last_name}
              size={32}
            />
          </Link>
        )}
      </div>
    </div>
  );
}
