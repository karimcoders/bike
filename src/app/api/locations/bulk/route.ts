import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// POST /api/locations/bulk  (existing) — bulk CREATE boxes.
// DELETE /api/locations/bulk — bulk DELETE empty boxes only.
//
// SAFETY: Bulk delete refuses any location that still contains products.
// We return a per-location report so the UI can show exactly which boxes
// were skipped (and why). Products are NEVER deleted by this endpoint.

export async function POST(req: Request) {
  try {
    await requireUser();
    const { count, mode = "simple", racks } = await req.json();
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      return err("Count 1 se 1000 ke beech hona chahiye");
    }

    if (mode === "simple") {
      // Simple box mode: code = "1".."N", rack = "BOX", row = 1, box = i
      const existing = await db.location.findMany({
        where: { rack: "BOX" },
        select: { code: true },
      });
      const existingCodes = new Set(existing.map((l) => l.code));
      const toCreate: { code: string; rack: string; row: number; box: number }[] =
        [];
      for (let i = 1; i <= count; i++) {
        const code = String(i);
        if (existingCodes.has(code)) continue;
        toCreate.push({ code, rack: "BOX", row: 1, box: i });
      }
      if (toCreate.length > 0) {
        // We already filtered existing codes above, so a plain createMany
        // is correct. (skipDuplicates is omitted — it is unsupported on the
        // SQLite Prisma client used locally, though PostgreSQL supports it
        // in production. The pre-filter makes it unnecessary either way.)
        await db.location.createMany({ data: toCreate });
      }
      return ok(
        {
          created: toCreate.length,
          skipped: count - toCreate.length,
          total: existing.length + toCreate.length,
        },
        201
      );
    }

    // rack mode
    if (!Array.isArray(racks) || racks.length === 0) {
      return err("Rack mode ke liye racks array chahiye");
    }
    let created = 0;
    let skipped = 0;
    for (const r of racks) {
      const name = String(r.name || "").trim();
      const cnt = Number(r.count) || 0;
      if (!name || cnt < 1) continue;
      const existing = await db.location.findMany({
        where: { rack: name },
        select: { code: true },
      });
      const existingCodes = new Set(existing.map((l) => l.code));
      const toCreate: { code: string; rack: string; row: number; box: number }[] =
        [];
      for (let i = 1; i <= cnt; i++) {
        const code = `${name}-${i}`;
        if (existingCodes.has(code)) {
          skipped++;
          continue;
        }
        toCreate.push({ code, rack: name, row: 1, box: i });
      }
      if (toCreate.length > 0) {
        await db.location.createMany({ data: toCreate });
        created += toCreate.length;
      }
    }
    return ok({ created, skipped, total: created + skipped }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Bulk create fail hua", 500);
  }
}

// DELETE /api/locations/bulk — delete multiple EMPTY locations at once.
//
// Body: { ids: string[] }
// Returns: { deleted: number, skipped: { id, code, productCount }[] }
//
// Each location is checked for products before deletion. Occupied locations
// are skipped and reported back so the UI can tell the owner which boxes
// couldn't be removed. Products are never touched.
export async function DELETE(req: Request) {
  try {
    await requireUser();
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return err("Delete karne ke liye locations chunein");
    }

    // Fetch all selected locations with their product counts in ONE query.
    const locs = await db.location.findMany({
      where: { id: { in: ids } },
      include: { products: { select: { id: true } } },
    });

    const skipped: { id: string; code: string; productCount: number }[] = [];
    const emptyIds: string[] = [];
    for (const l of locs) {
      if (l.products.length > 0) {
        skipped.push({
          id: l.id,
          code: l.code,
          productCount: l.products.length,
        });
      } else {
        emptyIds.push(l.id);
      }
    }

    if (emptyIds.length > 0) {
      // deleteMany in one round-trip — products are protected by the filter
      // above (only emptyIds are passed), and the DB has no ON DELETE CASCADE
      // from Location→Product (products hold a nullable locationId FK, so
      // deleting a location with no products is safe).
      await db.location.deleteMany({ where: { id: { in: emptyIds } } });
    }

    return ok({
      deleted: emptyIds.length,
      skipped,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Bulk delete fail hua", 500);
  }
}
