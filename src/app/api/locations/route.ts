import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/locations — LIST endpoint.
//
// PERFORMANCE: This used to `include: { products: { select: { id, name,
// quantity, minStock } } }` for EVERY location. With 136 locations and 37
// products that pulled a large nested payload and took ~1.4s on Neon.
//
// Now we only fetch the location columns + a cheap `_count` of products per
// location. The grid only needs to know "empty vs occupied + how many", so
// `productCount` is enough. Full product lists are fetched on demand via
// GET /api/locations/[id] when the owner opens a single box.
//
// Target: <300ms on normal production conditions.
export async function GET() {
  try {
    await requireUser();
    const locations = await db.location.findMany({
      orderBy: [{ rack: "asc" }, { row: "asc" }, { box: "asc" }],
      select: {
        id: true,
        code: true,
        rack: true,
        row: true,
        box: true,
        createdAt: true,
        _count: { select: { products: true } },
      },
    });
    // Flatten _count.products → productCount so the client type stays flat
    // and backward-friendly.
    const flat = locations.map((l) => ({
      id: l.id,
      code: l.code,
      rack: l.rack,
      row: l.row,
      box: l.box,
      createdAt: l.createdAt.toISOString(),
      productCount: l._count.products,
    }));
    return ok({ locations: flat });
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
