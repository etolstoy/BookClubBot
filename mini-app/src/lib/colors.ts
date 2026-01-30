/**
 * Color utilities for user avatars
 */

// Predefined palette of distinct, visually appealing colors
const AVATAR_COLORS = [
  "#E57373", // Red
  "#F06292", // Pink
  "#BA68C8", // Purple
  "#9575CD", // Deep Purple
  "#7986CB", // Indigo
  "#64B5F6", // Blue
  "#4FC3F7", // Light Blue
  "#4DD0E1", // Cyan
  "#4DB6AC", // Teal
  "#81C784", // Green
  "#AED581", // Light Green
  "#FFD54F", // Amber
  "#FFB74D", // Orange
  "#FF8A65", // Deep Orange
];

/**
 * Generate a consistent color for a user based on their ID
 * @param userId - Telegram user ID as string
 * @returns Hex color from the palette
 */
export function hashUserIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Generate initials from user's first and last name
 * @param firstName - User's first name
 * @param lastName - User's last name (optional)
 * @returns 1-2 character initials
 */
export function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName.charAt(0).toUpperCase();
  if (lastName) {
    return first + lastName.charAt(0).toUpperCase();
  }
  return first;
}
