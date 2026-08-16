import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok, cachedOk } from "@/lib/api";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category") || "";
    const bike = searchParams.get("bike")?.trim() || "";
    const brand = searchParams.get("brand")?.trim() || "";
    const location = searchParams.get("location") || "";
    const supplier = searchParams.get("supplier")?.trim() || "";
    const limit = Math.min(Number(searchParams.get("limit") || 500), 1000);

    const where: Prisma.ProductWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { oemNumber: { contains: q } },
        { brand: { contains: q } },
        { bikeModels: { contains: q } },
        { supplier: { contains: q } },
        { barcode: { contains: q } },
      ];
    }
    if (category) where.categoryId = category;
    if (brand) where.brand = { contains: brand };
    if (bike) where.bikeModels = { contains: bike };
    if (location) where.locationId = location;
    if (supplier) where.supplier = { contains: supplier };

    const products = await db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      // CRITICAL: use `select` (NOT `include`) to control exactly which
      // fields are returned. We EXCLUDE `notes` (can be long) and
      // transform `photo`: if it contains base64 data URLs (legacy
      // products), replace with a flag so the list response stays small.
      // The full photo URL is fetched on demand by the product detail page.
      // This prevents a 37-product list from returning 17MB of base64.
      select: {
        id: true,
        name: true,
        bikeModels: true,
        brand: true,
        oemNumber: true,
        categoryId: true,
        locationId: true,
        purchasePrice: true,
        sellingPrice: true,
        quantity: true,
        minStock: true,
        supplier: true,
        photo: true,
        barcode: true,
        lastSoldAt: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        location: { select: { id: true, code: true, rack: true, row: true, box: true } },
      },
    });

    // ---- Strip base64 data URLs from the photo field ----
    // Legacy products store photos as base64 data URLs (4MB each!). If we
    // return them in the list, the response balloons to 17MB+. Instead,
    // if a product's photo contains base64, we replace it with a small
    // marker ("BASE64") so the frontend knows a photo exists. The actual
    // photo is shown by fetching the single product detail (which is a
    // smaller, one-product response).
    //
    // After running the /api/admin/migrate-photos endpoint, no products
    // will have base64 photos and this code becomes a no-op.
    const lightweightProducts = products.map((p) => ({
      ...p,
      photo:
        p.photo && p.photo.includes("data:")
          ? "BASE64" // marker — frontend shows placeholder, fetches detail for real photo
          : p.photo,
    }));

    // CRITICAL: use `cachedOk` (Cache-Control: private, no-store) — NEVER
    // `max-age` / `stale-while-revalidate`. In a multi-device shop, HTTP cache
    // is per-browser: if desktop adds a product, mobile's cached response would
    // keep showing the old list for `max-age` seconds → data mismatch. `no-store`
    // forces every request to hit the production DB so both devices stay in sync.
    // Perceived speed is preserved by React Query's in-memory cache (staleTime
    // 30s) + localStorage optimistic initialData on the dashboard.
    return cachedOk({ products: lightweightProducts });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to fetch products", 500);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const {
      name,
      bikeModels,
      brand,
      oemNumber,
      categoryId,
      locationId,
      purchasePrice,
      sellingPrice,
      quantity,
      minStock,
      supplier,
      photo,
      notes,
      barcode,
    } = body;

    if (!name || !name.trim()) return err("Product name is required");

    // NOTE: A location box can hold MULTIPLE products (bike parts shop).
    // We deliberately do NOT check for an existing product at this locationId.
    // The DB no longer enforces a unique constraint on Product.locationId.

    const product = await db.product.create({
      data: {
        name: name.trim(),
        bikeModels: bikeModels || "",
        brand: brand || "",
        oemNumber: oemNumber || "",
        categoryId: categoryId || null,
        locationId: locationId || null,
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        quantity: Number(quantity) || 0,
        minStock: Number(minStock) || 0,
        supplier: supplier || "",
        photo: photo || null,
        notes: notes || "",
        barcode: barcode || null,
      },
      include: { category: true, location: true },
    });

    // Record initial movement if quantity > 0
    if (Number(quantity) > 0) {
      await db.movement.create({
        data: {
          productId: product.id,
          type: "ADDED",
          quantity: Number(quantity),
          reason: "New product added",
          userId: user.id,
        },
      });
    }

    return ok({ product }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to create product", 500);
  }
}
