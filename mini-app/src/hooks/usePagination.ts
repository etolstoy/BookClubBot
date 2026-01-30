import { useState } from "react";
import { useSearchParams } from "react-router-dom";

interface UsePaginationOptions {
  itemsPerPage?: number;
  additionalParams?: Record<string, string>;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const { itemsPerPage = 20, additionalParams = {} } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const pageParam = searchParams.get("page");
    return pageParam ? parseInt(pageParam, 10) : 1;
  });

  const [hasMore, setHasMore] = useState(true);

  const handlePrevPage = () => {
    if (page > 1) {
      const newPage = page - 1;
      setPage(newPage);
      setSearchParams({ ...additionalParams, page: newPage.toString() });
      window.scrollTo(0, 0);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      const newPage = page + 1;
      setPage(newPage);
      setSearchParams({ ...additionalParams, page: newPage.toString() });
      window.scrollTo(0, 0);
    }
  };

  const updateSearchParams = (params: Record<string, string>) => {
    setSearchParams({ ...params, page: page.toString() });
  };

  const resetToFirstPage = () => {
    setPage(1);
    setSearchParams({ ...additionalParams, page: "1" });
  };

  return {
    page,
    setPage,
    hasMore,
    setHasMore,
    handlePrevPage,
    handleNextPage,
    updateSearchParams,
    resetToFirstPage,
    itemsPerPage,
  };
}
