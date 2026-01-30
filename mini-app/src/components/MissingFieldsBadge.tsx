interface MissingFieldsBadgeProps {
  fields?: string[];
  labels: Record<string, string>;
  className?: string;
}

export default function MissingFieldsBadge({
  fields,
  labels,
  className = "mt-3",
}: MissingFieldsBadgeProps) {
  if (!fields || fields.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {fields.map((field) => (
        <span
          key={field}
          className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded"
        >
          {labels[field] || field}
        </span>
      ))}
    </div>
  );
}
