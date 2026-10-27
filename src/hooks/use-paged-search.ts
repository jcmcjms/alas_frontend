import { useState } from "react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"

/**
 * Debounced search input + page number that resets to 1 whenever the committed
 * search term changes. The reset uses React's render-time "adjusting state"
 * pattern instead of an effect (avoids cascading renders).
 */
export function usePagedSearch(delayMs = 300) {
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(searchInput, delayMs)

  const [committedSearch, setCommittedSearch] = useState(debouncedSearch)
  if (committedSearch !== debouncedSearch) {
    setCommittedSearch(debouncedSearch)
    setPage(1)
  }

  function clearSearch() {
    setSearchInput("")
  }

  return {
    searchInput,
    setSearchInput,
    debouncedSearch,
    page,
    setPage,
    clearSearch,
  }
}
