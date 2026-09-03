import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ApiError } from "./lib/api";

/**
 * React Query's default is three retries with exponential backoff. Against a
 * backend that is genuinely down that turns one broken panel into four requests
 * and leaves the page shimmering for ten seconds before any error state appears —
 * so the operator sees a loading skeleton when what they need to see is "the
 * database is not responding".
 *
 * A request is only worth repeating if it might succeed next time. A 4xx will
 * not, and neither will a 5xx from a backend whose database is unreachable, so
 * allow exactly one retry for transport blips and stop.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError) {
    // status 0 is "never reached the server" — worth one more attempt.
    if (error.status === 0) return true;
    return error.status >= 500;
  }
  return true;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: 1000,
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
