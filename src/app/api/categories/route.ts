import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();
    const categories = await db.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return ok({ categories });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch categories", 500);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const { name, icon, color } = await req.json();
    if (!name?.trim()) return err("Category name required");
    const existing = await db.category.findUnique({ where: { name: name.trim() } });
    if (existing) return err("Category already exists");
    const category = await db.category.create({
      data: { name: name.trim(), icon: icon || null, color: color || null },
    });
    return ok({ category }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to create category", 500);
  }
}
