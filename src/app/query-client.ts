import { QueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/api-error"

/**
 * Query client defaults (Frontend Auto.md §6):
 * - Freshness is decided per query in the feature hooks, not globally; the
 *   default staleTime is 0 so sensitive banking data always revalidates.
 * - Retries: 1 for idempotent GETs, none for 4xx business failures.
 * - No persistence: nothing user-specific ever reaches browser storage.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        retry(failureCount, error) {
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false
          }
          return failureCount < 1
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Mutations are never retried automatically: a duplicated approve or
        // disburse must not happen because of a flaky network.
        retry: false,
      },
    },
  })
}
