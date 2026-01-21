import { useNavigate, useLocation } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHomePage = location.pathname === "/";

  // Show back button on all screens except homepage
  const showBackButton = !isHomePage;

  const handleBack = () => {
    // Use browser history if available, otherwise go home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-tg-bg sticky top-0 z-50 border-b border-tg-secondary">
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
  );
}
