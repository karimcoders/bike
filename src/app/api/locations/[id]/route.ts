import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/locations/[id] — DETAIL endpoint.
//
// Fetches ONE location together with the products stored inside it. This is
// called on demand (when the owner opens a box) so the list endpoint can stay
// cheap (count-only). Returns the product fields needed to render the box
// contents + a link to open/move each product.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const loc = await db.location.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            quantity: true,
            minStock: true,
            brand: true,
            oemNumber: true,
            sellingPrice: true,
            photo: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!loc) return err("Location not found", 404);
    return ok({
      location: {
        id: loc.id,
        code: loc.code,
        rack: loc.rack,
        row: loc.row,
        box: loc.box,
        createdAt: loc.createdAt.toISOString(),
        products: loc.products,
      },
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch location", 500);
  }
}

// PATCH /api/locations/[id] — RENAME a location's code.
//
// The owner can rename a box (e.g. "27" → "27A"). We re-derive rack/row/box
// from the new code only when it follows the rack-row-box pattern; otherwise
// we keep the existing rack/row/box and only update the code. Uniqueness is
// enforced by the DB unique constraint — we surface a friendly message.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const { code, rack, row, box } = await req.json();
    if (!code || typeof code !== "string" || !code.trim()) {
      return err("Location code (naam) zaroori hai");
    }
    const cleanCode = code.trim();

    // Ensure the new code isn't taken by another location.
    const clash = await db.location.findUnique({ where: { code: cleanCode } });
    if (clash && clash.id !== id) {
      return err("Ye naam pehle se kisi aur box ka hai");
    }

    const data: { code: string; rack?: string; row?: number; box?: number } = {
      code: cleanCode,
    };
    if (typeof rack === "string" && rack.trim()) data.rack = rack.trim();
    if (Number.isFinite(Number(row))) data.row = Number(row);
    if (Number.isFinite(Number(box))) data.box = Number(box);

    const updated = await db.location.update({ where: { id }, data });
    return ok({ location: updated });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Location update nahi hui", 500);
  }
}

// DELETE /api/locations/[id] — delete ONE location.
//
// SAFETY: A location that still contains products is NEVER silently deleted.
// We block with a clear message telling the owner how many products are
// inside, so they can move them first. Empty locations delete immediately.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const loc = await db.location.findUnique({
      where: { id },
      include: { products: { select: { id: true } } },
    });
    if (!loc) return err("Location not found", 404);
    if (loc.products.length > 0) {
      return err(
        `Is box me ${loc.products.length} product(s) rakhe hain. Pehle products doosre box me move karein.`,
        409
      );
    }
    await db.location.delete({ where: { id } });
    return ok({ success: true });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to delete location", 500);
  }
}
