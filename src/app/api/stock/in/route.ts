import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// Stock In: increase quantity, record ADDED movement
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { productId, quantity, reason, note } = await req.json();
    const qty = Number(quantity);
    if (!productId) return err("Product ID required");
    if (!qty || qty <= 0) return err("Quantity must be greater than 0");

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return err("Product not found", 404);

    const updated = await db.product.update({
      where: { id: productId },
      data: { quantity: { increment: qty } },
      include: { category: true, location: true },
    });

    await db.movement.create({
      data: {
        productId,
        type: "ADDED",
        quantity: qty,
        reason: reason || "Stock in",
        note: note || "",
        userId: user.id,
      },
    });

    return ok({ product: updated });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to add stock", 500);
  }
}
