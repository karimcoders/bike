import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/sales/[id] — single sale with full details for bill printing
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                photo: true,
                location: { select: { code: true } },
              },
            },
          },
        },
        customer: { select: { id: true, name: true, phone: true, type: true } },
        user: { select: { name: true } },
      },
    });
    if (!sale) return err("Sale not found", 404);
    return ok({ sale });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch sale", 500);
  }
}
