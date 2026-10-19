"use client";

import { useEffect, useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUiStore } from "@/stores/ui-store";

const LEGACY_LOCALE_KEY = "zns-locale";

function makeQueryClient() {
  return new QueryClient({
    // Queries/mutations opt into a toast by setting meta.errorMessage; the
    // server's own error text is appended when there is one.
    queryCache: new QueryCache({
      onError: (error, query) => {
        const prefix = query.meta?.errorMessage;
        if (typeof prefix === "string") toast.error(`${prefix}: ${error.message}`);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        const prefix = mutation.meta?.errorMessage;
        toast.error(typeof prefix === "string" ? `${prefix}: ${error.message}` : error.message);
      },
    }),
    defaultOptions: {
      queries: {
        // Revisiting a page renders cached data instantly and refreshes it in
        // the background instead of blanking to a spinner.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 1,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const locale = useUiStore((s) => s.locale);

  useEffect(() => {
    useUiStore.persist.rehydrate();
    // One-time migration from the pre-Zustand locale key.
    try {
      const legacy = window.localStorage.getItem(LEGACY_LOCALE_KEY);
      if (legacy === "vi" || legacy === "ko") {
        useUiStore.getState().setLocale(legacy);
        window.localStorage.removeItem(LEGACY_LOCALE_KEY);
      }
    } catch {
      // Storage unavailable (private mode etc.) — defaults are fine.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
