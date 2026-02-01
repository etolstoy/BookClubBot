import { Link } from "react-router-dom";
import Avatar from "./Avatar.js";
import { useTranslation } from "../i18n/index.js";

interface UserCardProps {
  user: {
    odId: string;
    displayName: string | null;
    username: string | null;
    reviewCount: number;
  };
}

export default function UserCard({ user }: UserCardProps) {
  const { plural } = useTranslation();

  const displayName = user.displayName || user.username || "Anonymous";
  const firstName = displayName.split(" ")[0] || displayName;
  const lastName = displayName.split(" ").slice(1).join(" ") || null;

  return (
    <Link
      to={`/reviewer/${user.odId}`}
      className="flex gap-3 p-3 rounded-lg bg-tg-secondary hover:opacity-80 transition-opacity no-underline"
    >
      <Avatar
        userId={user.odId}
        firstName={firstName}
        lastName={lastName}
        size={48}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="font-semibold text-tg-text truncate">{displayName}</h3>
        <div className="flex items-center gap-2">
          {user.username && (
            <span className="text-sm text-tg-hint truncate">@{user.username}</span>
          )}
          <span className="text-sm text-tg-hint">
            {plural("plurals.reviews", user.reviewCount)}
          </span>
        </div>
      </div>
    </Link>
  );
}
