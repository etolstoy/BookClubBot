import { useState, useCallback } from "react";
import { useTranslation } from "../i18n/index.js";

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder }: SearchBarProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const defaultPlaceholder = placeholder || t("home.searchPlaceholder");

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
        placeholder={defaultPlaceholder}
        className="flex-1 px-4 py-2 rounded-lg bg-tg-secondary text-tg-text placeholder-tg-hint border-none outline-none focus:ring-2 focus:ring-black"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-[#3D3D3D] text-white font-medium hover:bg-white hover:text-black hover:border-2 hover:border-black transition-colors border-2 border-transparent"
      >
        {t("common.search")}
      </button>
    </form>
  );
}
