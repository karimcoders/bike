import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, err, handleAuthError, cachedOk } from "@/lib/api";

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
    return cachedOk({ locations: flat });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch locations", 500);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await req.json();

    // ---- Simple mode: { number: N } --------------------------------------
    // The owner wants flat numbered boxes (Box 1, Box 2, ... Box N). We
    // store code = String(N), rack = "BOX", row = 1, box = N. The code is
    // what the UI shows via displayLocation() -> "Box N".
    //
    // If a box with this code already exists we return a friendly error
    // (caller surfaces it via toast).
    if (typeof body.number === "number" || typeof body.number === "string") {
      const n = Number(body.number);
      if (!Number.isInteger(n) || n < 1) {
        return err("Sahi number daalo (1 ya usse zyada)");
      }
      const code = String(n);
      const existing = await db.location.findUnique({ where: { code } });
      if (existing) {
        return err(`Box ${n} pehle se ban gaya hai`);
      }
      const location = await db.location.create({
        data: { code, rack: "BOX", row: 1, box: n },
      });
      return ok({ location }, 201);
    }

    // ---- Legacy mode: { rack, row, box } ---------------------------------
    // Kept for backward compatibility. Creates codes like "A-1-04".
    const { rack, row, box } = body;
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
