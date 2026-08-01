import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// Stock Out: decrease quantity, record REMOVED movement
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { productId, quantity, reason, note } = await req.json();
    const qty = Number(quantity);
    if (!productId) return err("Product ID required");
    if (!qty || qty <= 0) return err("Quantity must be greater than 0");

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) return err("Product not found", 404);
    if (product.quantity < qty)
      return err(
        `Only ${product.quantity} in stock. Cannot remove ${qty}.`
      );

    const updated = await db.product.update({
      where: { id: productId },
      data: { quantity: { decrement: qty } },
      include: { category: true, location: true },
    });

    await db.movement.create({
      data: {
        productId,
        type: "REMOVED",
        quantity: -qty,
        reason: reason || "Stock out",
        note: note || "",
        userId: user.id,
      },
    });

    return ok({ product: updated });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to remove stock", 500);
  }
}
