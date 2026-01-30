import { hashUserIdToColor, getInitials } from "../lib/colors.js";

interface AvatarProps {
  userId: string;
  firstName: string;
  lastName?: string | null;
  size?: number;
}

export default function Avatar({
  userId,
  firstName,
  lastName,
  size = 32,
}: AvatarProps) {
  const backgroundColor = hashUserIdToColor(userId);
  const initials = getInitials(firstName, lastName);

  // Font size scales with avatar size
  const fontSize = Math.round(size * 0.45);

  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        backgroundColor,
        fontSize,
      }}
    >
      {initials}
    </div>
  );
}
