/**
 * Returns a medal emoji for top 3 ranks, otherwise the rank number with a dot
 * @param rank - The rank position (1, 2, 3, ...)
 * @returns Medal emoji (🥇🥈🥉) for ranks 1-3, or "rank." for others
 */
export function getRankEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}
