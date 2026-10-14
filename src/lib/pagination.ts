// null = gap. always shows first and last, plus 2 pages around the current one
export function paginationEntries(totalPages: number, currentPage: number) {
  const pages = new Set<number>([1, totalPages]);

  if (totalPages <= 9) {
    for (let page = 1; page <= totalPages; page += 1) {
      pages.add(page);
    }
  } else {
    // 5 page window around the current page, pinned at the ends
    const start =
      currentPage <= 3 ? 1 : currentPage >= totalPages - 2 ? totalPages - 4 : currentPage - 2;
    const end = currentPage <= 3 ? 5 : currentPage >= totalPages - 2 ? totalPages : currentPage + 2;
    for (let page = start; page <= end; page += 1) {
      pages.add(page);
    }
  }

  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  return sortedPages.flatMap((page, index) =>
    index > 0 && page - sortedPages[index - 1] > 1 ? [null, page] : [page],
  );
}
