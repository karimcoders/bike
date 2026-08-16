import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ---- cachedOk ----
// Returns a JSON response with a private browser cache (30s fresh, 5min SWR).
// Use for GET endpoints that return user-scoped data that changes infrequently
// (locations list, settings, categories, etc). This eliminates repeat DB
// round-trips when navigating between views, which is the single biggest
// perceived-perf win for "the app feels slow" on Vercel serverless + Neon
// (where every uncached call pays a ~500-1000ms cold-start penalty).
//
// Safe because:
//   - "private" → never cached by a shared CDN/proxy (only the user's browser)
//   - the data is authenticated + cookie-scoped
//   - stale-while-revalidate serves stale instantly + refreshes in background
export function cachedOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
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
