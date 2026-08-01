import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// PUT /api/staff/[id] — update staff (role, phone, active, password)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return err("Admin access required", 403);
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, string | boolean> = {};
    if (body.role) {
      const validRoles = ["ADMIN", "MANAGER", "SALESMAN", "MECHANIC"];
      if (!validRoles.includes(body.role))
        return err("Invalid role");
      data.role = body.role;
    }
    if (body.phone !== undefined) data.phone = String(body.phone);
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.password) {
      if (body.password.length < 4)
        return err("Password must be at least 4 characters");
      data.password = body.password;
    }
    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        active: true,
      },
    });
    return ok({ staff: updated });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to update staff", 500);
  }
}

// DELETE /api/staff/[id] — delete staff (admin only, cannot delete self)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (user.role !== "ADMIN") return err("Admin access required", 403);
    const { id } = await params;
    if (id === user.id) return err("Cannot delete your own account", 400);
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return err("Staff user not found", 404);
    await db.user.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to delete staff", 500);
  }
}
