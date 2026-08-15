import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Types ----
type RackSpec = { name: string; count: number };

type BulkBody = {
  count?: number;
  mode?: "simple" | "rack";
  racks?: RackSpec[];
};

// POST /api/locations/bulk
// Auto-generates N simple box locations (rack="BOX", row=1, box=i, code=String(i)),
// OR per-rack locations when mode="rack".
//
// Simple mode (default):
//   Body: { count: number, mode?: "simple" }
//   For i in 1..count: rack="BOX", row=1, box=i, code=String(i)
//   e.g. "1", "2", ... "100" — unique numeric strings that won't collide
//   with existing "A-1-01" style codes used elsewhere.
//
// Rack mode:
//   Body: { mode: "rack", racks: [{ name: string, count: number }] }
//   For each rack: for i in 1..rack.count: rack=rack.name, row=1, box=i,
//   code=`${rack.name}-${i}` (e.g. "Rack 1-1", "Rack 1-2")
//
// Idempotent: codes that already exist are skipped (no failure).
// Returns: { success: true, data: { created, skipped, total } }
export async function POST(req: Request) {
  try {
    await requireUser();

    let body: BulkBody;
    try {
      body = (await req.json()) as BulkBody;
    } catch {
      return err("Invalid JSON body");
    }

    const mode = body.mode ?? "simple";

    if (mode !== "simple" && mode !== "rack") {
      return err("mode must be 'simple' or 'rack'");
    }

    // Build the list of locations to create.
    // Each entry: { code, rack, row, box }
    const toCreate: { code: string; rack: string; row: number; box: number }[] =
      [];

    if (mode === "simple") {
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 1000) {
        return err("count must be an integer between 1 and 1000");
      }
      for (let i = 1; i <= count; i++) {
        toCreate.push({
          code: String(i),
          rack: "BOX",
          row: 1,
          box: i,
        });
      }
    } else {
      // rack mode
      const racks = body.racks;
      if (!Array.isArray(racks) || racks.length === 0) {
        return err("racks array is required for rack mode");
      }
      if (racks.length > 100) {
        return err("Too many racks (max 100)");
      }
      for (const r of racks) {
        if (!r || typeof r.name !== "string" || !r.name.trim()) {
          return err("Each rack must have a non-empty name");
        }
        const name = r.name.trim().slice(0, 40);
        const count = Number(r.count);
        if (!Number.isInteger(count) || count < 1 || count > 1000) {
          return err(
            `Rack "${name}" count must be an integer between 1 and 1000`
          );
        }
        for (let i = 1; i <= count; i++) {
          toCreate.push({
            code: `${name}-${i}`,
            rack: name,
            row: 1,
            box: i,
          });
        }
      }
    }

    if (toCreate.length === 0) {
      return ok({
        success: true,
        data: { created: 0, skipped: 0, total: 0 },
      });
    }

    // Fetch existing codes that overlap with what we want to create,
    // so we can skip them idempotently (no upsert, no failure).
    const codes = toCreate.map((l) => l.code);
    const existing = await db.location.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const existingSet = new Set(existing.map((l) => l.code));

    const fresh = toCreate.filter((l) => !existingSet.has(l.code));
    const skipped = toCreate.length - fresh.length;

    // createMany skips unique constraint violations only if `skipDuplicates`
    // is true, but we already filtered, so use a plain createMany for speed.
    let created = 0;
    if (fresh.length > 0) {
      // SQLite supports createMany; this is one round-trip.
      const result = await db.location.createMany({
        data: fresh.map((l) => ({
          code: l.code,
          rack: l.rack,
          row: l.row,
          box: l.box,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    return ok({
      success: true,
      data: {
        created,
        skipped,
        total: created + skipped,
      },
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to bulk-create locations", 500);
  }
}
