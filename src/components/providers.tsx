"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

// ---- React Query client configuration ----
//
// DATA CONSISTENCY POLICY (CRITICAL):
// This is a multi-device shop. The owner opens the same production URL on
// desktop AND mobile. Both MUST see the same data — the production database
// is the single source of truth, NEVER the browser cache.
//
// To guarantee this:
//   1. refetchOnWindowFocus: true  — switching back to the tab ALWAYS refetches
//      if data is stale. This is the #1 fix for "desktop added a product but
//      mobile still shows the old list" — mobile refetches the moment the
//      owner looks at it.
//   2. refetchOnMount: true — navigating to a view refetches if data is stale.
//   3. staleTime: 30s — data is considered fresh for only 30s (was 2min).
//      After 30s, any mount/focus triggers a background refetch that silently
//      replaces the displayed data with the server's latest.
//   4. refetchOnReconnect: "always" — when the network comes back, refetch.
//
// The localStorage optimistic cache (useDashboard/useSettings) still gives
// INSTANT first paint, but the background refetch always verifies against the
// server. If the server differs, server wins (React Query replaces the data).
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30s — short so cross-device changes surface fast
            gcTime: 10 * 60 * 1000, // 10 min — keep cached data in memory
            refetchOnWindowFocus: true, // ALWAYS refetch on tab focus if stale
            refetchOnMount: true, // refetch when a view mounts if data is stale
            refetchOnReconnect: "always",
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
