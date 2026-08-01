import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { err, ok } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) return err("Username and password required");

    const user = await db.user.findUnique({ where: { username } });
    if (!user) return err("Invalid username or password", 401);
    if (!verifyPassword(password, user.password))
      return err("Invalid username or password", 401);

    await createSession({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as "ADMIN" | "STAFF",
    });

    return ok({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    return err("Login failed", 500);
  }
}
