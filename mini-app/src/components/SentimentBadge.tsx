interface SentimentBadgeProps {
  sentiment: "positive" | "negative" | "neutral";
  size?: "sm" | "md";
}

export default function SentimentBadge({ sentiment, size = "sm" }: SentimentBadgeProps) {
  const emoji = sentiment === "positive" ? "👍" : sentiment === "negative" ? "👎" : "😐";
  const sizeClass = size === "sm" ? "text-sm" : "text-base";

  return (
    <span className={sizeClass} title={sentiment}>
      {emoji}
    </span>
  );
}
