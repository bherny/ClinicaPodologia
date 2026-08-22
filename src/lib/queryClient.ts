import { MutationCache, QueryClient } from "@tanstack/react-query";
import { playUiSound } from "./sound";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => playUiSound("success"),
    onError: () => playUiSound("error")
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1
    },
    mutations: {
      retry: 0
    }
  }
});