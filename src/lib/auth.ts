import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "./db";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "bike-inventory-pro-dev-secret-change-me";

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "STAFF";
};

// ---- Password hashing (scrypt) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(password, salt, 64);
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}

// ---- Session (signed cookie) ----
function sign(payload: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  try {
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return payload;
  } catch {
    return null;
  }
}

const COOKIE_NAME = "bip_session";

export async function createSession(user: SessionUser) {
  const payload = Buffer.from(
    JSON.stringify(user)
  ).toString("base64url");
  const token = sign(payload);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    // In production (Vercel HTTPS), mark the cookie as Secure so it's only
    // sent over HTTPS. This prevents cookie theft over HTTP. Locally
    // (http://localhost) we omit Secure so the cookie still works.
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SessionUser;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

// Helper: fetch current user from DB (validates session still valid)
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as "ADMIN" | "STAFF",
  };
}
