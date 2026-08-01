import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

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
    if (loc.products.length > 0)
      return err("Cannot delete: a product is assigned to this box");
    await db.location.delete({ where: { id } });
    return ok({ success: true });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to delete location", 500);
  }
}
