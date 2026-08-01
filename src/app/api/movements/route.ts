import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const movements = await db.movement.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        product: { select: { id: true, name: true, oemNumber: true } },
        user: { select: { id: true, name: true, role: true } },
      },
    });
    return ok({ movements });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch movements", 500);
  }
}
