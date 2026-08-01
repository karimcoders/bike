import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();
    const locations = await db.location.findMany({
      orderBy: [{ rack: "asc" }, { row: "asc" }, { box: "asc" }],
      include: {
        products: {
          select: { id: true, name: true, quantity: true, minStock: true },
        },
      },
    });
    return ok({ locations });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch locations", 500);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const { rack, row, box } = await req.json();
    if (!rack || !row || !box) return err("Rack, row and box required");
    const code = `${rack}-${row}-${String(box).padStart(2, "0")}`;
    const existing = await db.location.findUnique({ where: { code } });
    if (existing) return err("Location code already exists");
    const location = await db.location.create({
      data: { code, rack, row: Number(row), box: Number(box) },
    });
    return ok({ location }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to create location", 500);
  }
}
