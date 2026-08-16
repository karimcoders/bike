import { getCurrentUser } from "@/lib/auth";
import { ok, cachedOk } from "@/lib/api";

// GET /api/auth/me
// Returns the current authenticated user (or null if not logged in).
//
// Browser-cached for 10s (SWR 60s). This prevents a refetch on every
// page navigation / view switch. If the session expires, the next
// API call that requires auth will return 401 and the frontend will
// redirect to login. 10s is short enough to be safe.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  return cachedOk({ user });
}
