import { useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-tg-bg sticky top-0 z-50 border-b border-tg-secondary">
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
