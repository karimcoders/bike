import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ---- cachedOk ----
// Returns a JSON response with `Cache-Control: private, no-store`.
//
// DATA CONSISTENCY POLICY (CRITICAL):
// This is a MULTI-DEVICE shop — the owner opens the same production URL on
// desktop AND mobile. Both devices MUST see the same data. The production
// database (Neon Postgres) is the SINGLE source of truth.
//
// We deliberately set `no-store` (NEVER `max-age` / `stale-while-revalidate`)
// because HTTP cache is PER-BROWSER. If desktop adds a product, mobile's HTTP
// cache would keep serving the old response for `max-age` seconds — making the
// two devices show different data. `no-store` forces every request to hit the
// server, so both devices always read the same live database.
//
// Perceived performance is preserved by:
//   - React Query in-memory cache (staleTime 30s) — repeat navigations within
//     30s don't hit the network at all.
//   - localStorage optimistic initialData (useDashboard/useSettings) — the
//     dashboard renders instantly from cache on reload, then a background
//     refetch verifies against the server (server wins).
//
// `private` ensures no shared CDN/proxy caches the response.
export function cachedOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export function handleAuthError(e: unknown) {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return err("Not logged in", 401);
    if (e.message === "FORBIDDEN") return err("Admin access required", 403);
  }
  return null;
}
