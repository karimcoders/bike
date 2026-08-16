"use client";

import { useState } from "react";
import { useLogin } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Bike, Loader2, Lock, User, Sparkles, AlertCircle } from "lucide-react";

// =============================================================================
// LoginView — Production-grade login form
// -----------------------------------------------------------------------------
// UX REQUIREMENTS (per owner spec):
//   1. Click Login → IMMEDIATELY show "Logging in..." + spinner + button DISABLED
//   2. No double-click / duplicate POST (button stays disabled until success/error)
//   3. On error → friendly Hindi/English message (never "Failed to fetch")
//   4. On success → session cookie set → React Query ["me"] updated → Home
//      re-renders → AppShell shows immediately (data loads in background)
//   5. 15s timeout built into useLogin (AbortController) — if server hangs,
//      button becomes clickable again + "Server response nahi de raha" message
//   6. NO artificial delay (setTimeout/sleep) — spinner reflects REAL network time
//
// AUTH FLOW:
//   click → login.mutate() → POST /api/auth/login → 200 + Set-Cookie bip_session
//        → onSuccess: qc.setQueryData(["me"], data) → Home sees user → AppShell
//   The login API calls createSession() BEFORE returning 200, so the cookie is
//   guaranteed set when onSuccess fires. No redirect-before-auth risk.
//
// DOUBLE-CLICK PROTECTION:
//   React Query sets login.isPending = true synchronously when mutate() is
//   called. The submit handler checks login.isPending at the top and returns
//   early if already pending. The button is also disabled={isBusy} so the
//   browser won't fire additional click/submit events. This covers all cases:
//   mouse double-click, Enter key in password field, and form resubmission.
// =============================================================================

export function LoginView() {
  const login = useLogin();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  // Local validation error (empty fields). Kept separate from login.error so
  // we don't waste a network call on obviously-empty input.
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // ---- Double-click protection ----
    // If a login request is already in-flight, ignore this submit entirely.
    // login.isPending is set synchronously by React Query when mutate() fires,
    // so even rapid double-clicks are caught here.
    if (login.isPending) return;

    // ---- Client-side validation (don't hit the API with empty fields) ----
    if (!username.trim() || !password.trim()) {
      setLocalError("Username aur password dono daalein.");
      return;
    }
    // Clear any previous local error before submitting
    setLocalError(null);
    // Clear any previous mutation error so the old error doesn't linger
    login.reset();

    login.mutate({ username: username.trim(), password });
  };

  // The button is disabled when login.isPending (React Query mutation in-flight).
  // This prevents ALL duplicate POSTs — the browser won't fire click/submit
  // events on a disabled button, and the submit() guard above catches Enter key.
  const isBusy = login.isPending;
  // Show the mutation error OR the local validation error (mutation error wins
  // if both exist, since it's more recent/important).
  const displayError = login.isError
    ? login.error?.message || "Login nahi ho paya. Dobara try karein."
    : localError;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-20 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 size-80 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md glass shadow-glow border-primary/20">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
              {isBusy ? (
                <Loader2 className="size-8 animate-spin" />
              ) : (
                <Bike className="size-8" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              AI Bike Parts Shop OS
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ShopMitra AI ke saath — apni dukaan smart banayein
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3" />
              AI-Powered · Voice Search · Photo Scan · Smart Insights
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (localError) setLocalError(null);
                    if (login.isError) login.reset();
                  }}
                  className="h-12 pl-10 rounded-xl text-base"
                  placeholder="admin"
                  autoComplete="username"
                  // Disable inputs while login is in-flight — prevents the user
                  // from changing credentials mid-request.
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (localError) setLocalError(null);
                    if (login.isError) login.reset();
                  }}
                  className="h-12 pl-10 rounded-xl text-base"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isBusy}
                />
              </div>
            </div>

            {/* ---- Error display ---- */}
            {/* Shows a clear, friendly error message when login fails OR when */}
            {/* the user submits with empty fields. The message comes from    */}
            {/* friendlyLoginError() in queries.ts — never a raw              */}
            {/* "Failed to fetch" or "Unexpected token".                      */}
            {displayError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            {/* ---- Login button ---- */}
            {/* States: */}
            {/*   Idle:      [ Login ]                                    */}
            {/*   Pending:   [ ⟳ Logging in... ]   (disabled, spinner)   */}
            {/*   Success:   auto-switches to AppShell (button not shown)  */}
            {/*   Error:     [ Login ]  + error message above             */}
            <Button
              type="submit"
              disabled={isBusy}
              className="h-12 w-full rounded-xl text-base font-semibold shadow-glow transition-all"
              aria-busy={isBusy}
              aria-live="polite"
            >
              {isBusy ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </Button>
          </form>

          <div className="mt-6 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Demo accounts:</p>
            <p>Admin — <span className="font-mono">admin / admin123</span></p>
            <p>Staff — <span className="font-mono">staff / staff123</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
