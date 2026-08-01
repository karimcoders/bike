"use client";

import { useState } from "react";
import { useLogin } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Bike, Loader2, Lock, User, Sparkles } from "lucide-react";

export function LoginView() {
  const login = useLogin();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

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
              <Bike className="size-8" />
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
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 pl-10 rounded-xl text-base"
                  placeholder="admin"
                  autoComplete="username"
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
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pl-10 rounded-xl text-base"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {login.isError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {login.error?.message || "Login failed"}
              </p>
            )}

            <Button
              type="submit"
              disabled={login.isPending}
              className="h-12 w-full rounded-xl text-base font-semibold shadow-glow"
            >
              {login.isPending ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Logging in...
                </>
              ) : (
                "Login"
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
