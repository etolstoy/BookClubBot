import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/index.js";

interface AuthorCardProps {
  author: {
    name: string;
    bookCount: number;
    reviewCount: number;
  };
}

export default function AuthorCard({ author }: AuthorCardProps) {
  const { plural } = useTranslation();

  return (
    <Link
      to={`/author/${encodeURIComponent(author.name)}`}
      className="flex gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity no-underline"
    >
      <div className="w-12 h-12 flex-shrink-0 rounded-full bg-tg-hint/20 flex items-center justify-center">
        <span className="text-xl">
          {author.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="font-semibold text-tg-text truncate">{author.name}</h3>
        <p className="text-sm text-tg-hint">
          {plural("plurals.books", author.bookCount)} · {plural("plurals.reviews", author.reviewCount)}
        </p>
      </div>
    </Link>
  );
}
