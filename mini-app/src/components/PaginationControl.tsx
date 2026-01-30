import { useTranslation } from "../i18n/index.js";

interface PaginationControlProps {
  page: number;
  hasMore: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export default function PaginationControl({
  page,
  hasMore,
  onPrevPage,
  onNextPage,
}: PaginationControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between mt-6">
      <button
        onClick={onPrevPage}
        disabled={page === 1}
        className={`px-5 py-2 rounded-full font-medium transition-colors ${
          page === 1
            ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
            : "bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black border-2 border-transparent"
        }`}
      >
        ←
      </button>

      <span className="text-tg-hint">{t("common.page")} {page}</span>

      <button
        onClick={onNextPage}
        disabled={!hasMore}
        className={`px-5 py-2 rounded-full font-medium transition-colors ${
          !hasMore
            ? "bg-tg-secondary text-tg-hint cursor-not-allowed"
            : "bg-[#3D3D3D] text-white hover:bg-white hover:text-black hover:border-2 hover:border-black border-2 border-transparent"
        }`}
      >
        →
      </button>
    </div>
  );
}
