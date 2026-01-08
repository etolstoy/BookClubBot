import { useState, useCallback } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = "Search books..." }: SearchBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) {
        onSearch(value.trim());
      }
    },
    [value, onSearch]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
    },
    []
  );

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="flex-1 px-4 py-2 rounded-lg bg-tg-secondary text-tg-text placeholder-tg-hint border-none outline-none focus:ring-2 focus:ring-tg-button"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-tg-button text-tg-button-text font-medium"
      >
        Search
      </button>
    </form>
  );
}
