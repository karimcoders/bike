import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        location: true,
        movements: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: true },
        },
      },
    });
    if (!product) return err("Product not found", 404);
    return ok({ product });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to fetch product", 500);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await req.json();

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return err("Product not found", 404);

    // NOTE: A location box can hold MULTIPLE products. We do NOT block moving
    // a product to a box that already contains other products. The DB no longer
    // enforces a unique constraint on Product.locationId.

    const data: Record<string, unknown> = {};
    const fields = [
      "name",
      "bikeModels",
      "brand",
      "oemNumber",
      "supplier",
      "notes",
      "photo",
      "barcode",
      "batchNo",
    ];
    for (const f of fields) if (f in body) data[f] = body[f] ?? "";
    if ("categoryId" in body) data.categoryId = body.categoryId || null;
    if ("locationId" in body) data.locationId = body.locationId || null;
    if ("purchasePrice" in body) data.purchasePrice = Number(body.purchasePrice) || 0;
    if ("sellingPrice" in body) data.sellingPrice = Number(body.sellingPrice) || 0;
    if ("minStock" in body) data.minStock = Number(body.minStock) || 0;
    // quantity is changed via stock in/out, but allow direct adjust
    if ("quantity" in body) {
      const newQty = Number(body.quantity) || 0;
      const diff = newQty - existing.quantity;
      data.quantity = newQty;
      // record adjustment movement
      if (diff !== 0) {
        await db.movement.create({
          data: {
            productId: id,
            type: "ADJUSTED",
            quantity: diff,
            reason: body.adjustReason || "Manual adjustment",
          },
        });
      }
    }

    const product = await db.product.update({
      where: { id },
      data,
      include: { category: true, location: true },
    });
    return ok({ product });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to update product", 500);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return err("Product not found", 404);

    // movements cascade delete
    await db.product.delete({ where: { id } });
    return ok({ success: true });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to delete product", 500);
  }
}
