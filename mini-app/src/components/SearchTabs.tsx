import { useTranslation } from "../i18n/index.js";

export type SearchTabType = "all" | "books" | "authors" | "users" | "reviews";

interface SearchTabsProps {
  activeTab: SearchTabType;
  onTabChange: (tab: SearchTabType) => void;
}

const TABS: SearchTabType[] = ["all", "books", "authors", "users", "reviews"];

export default function SearchTabs({ activeTab, onTabChange }: SearchTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`
            px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
            ${
              activeTab === tab
                ? "bg-tg-button text-tg-button-text"
                : "bg-tg-secondary text-tg-text hover:opacity-80"
            }
          `}
        >
          {t(`search.tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}
