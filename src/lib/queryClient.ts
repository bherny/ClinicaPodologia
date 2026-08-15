import { MutationCache, QueryClient } from "@tanstack/react-query";
import { playUiSound } from "./sound";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => playUiSound("success"),
    onError: () => playUiSound("error")
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});