import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/staff — list all staff users
export async function GET() {
  try {
    await requireUser();
    const staff = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        active: true,
        createdAt: true,
        _count: { select: { sales: true } },
      },
    });
    return ok({ staff });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch staff", 500);
  }
}

// POST /api/staff — create new staff user (admin only)
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return err("Admin access required", 403);
    const { username, password, name, role, phone } = await req.json();
    if (!username || !password || !name)
      return err("Username, password, and name required");
    if (password.length < 4)
      return err("Password must be at least 4 characters");
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) return err("Username already taken", 409);
    const validRoles = ["ADMIN", "MANAGER", "SALESMAN", "MECHANIC"];
    const finalRole = validRoles.includes(role) ? role : "SALESMAN";
    const newStaff = await db.user.create({
      data: {
        username,
        password,
        name,
        role: finalRole,
        phone: phone || "",
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        active: true,
        createdAt: true,
      },
    });
    return ok({ staff: newStaff }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to create staff user", 500);
  }
}
