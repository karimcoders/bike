import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleAuthError(e: unknown) {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return err("Not logged in", 401);
    if (e.message === "FORBIDDEN") return err("Admin access required", 403);
  }
  return null;
}
