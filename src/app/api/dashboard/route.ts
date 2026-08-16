import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, cachedOk } from "@/lib/api";

// GET /api/dashboard
// Returns the shop overview (stats + lists). Uses `cachedOk` which sets
// `Cache-Control: private, no-store` — see src/lib/api.ts for why we NEVER use
// `max-age` / `stale-while-revalidate` on data endpoints in a multi-device shop.
export async function GET() {
  try {
    await requireUser();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // ---- ALL queries in ONE parallel batch ----
    // This minimizes DB round-trips (the main bottleneck on Vercel serverless
    // + Neon, where each sequential query adds ~100-500ms of connection latency).
    const [
      countAgg,
      outOfStockCount,
      occupiedLocationsCount,
      categoryCount,
      locationCount,
      outOfStock,
      lowStockRows,
      recentProducts,
      recentMovements,
      priceRows,
      todayMovements,
      todaySales,
      allCustomers,
      grouped,
      allCategories,
    ] = await Promise.all([
      // Counts & sums
      db.product.aggregate({ _count: true, _sum: { quantity: true } }),
      db.product.count({ where: { quantity: { lte: 0 } } }),
      db.product.count({ where: { locationId: { not: null } } }),
      db.category.count(),
      db.location.count(),

      // Display lists (capped, with joins)
      // CRITICAL: use `select` (NOT `include`) to EXCLUDE the `photo` field.
      // Old products store base64 data URLs in `photo` (4MB each!). Returning
      // them here made the dashboard response 16MB → 8 second load times.
      // The dashboard does NOT render product photos in these lists — it only
      // shows names, brands, stock, and prices. Photos are fetched on demand
      // by the Products view / Product detail page.
      db.product.findMany({
        where: { quantity: { lte: 0 } },
        select: {
          id: true, name: true, brand: true, oemNumber: true,
          quantity: true, minStock: true, sellingPrice: true,
          categoryId: true, locationId: true,
          category: { select: { name: true } },
          location: { select: { code: true } },
        },
        take: 50,
        orderBy: { updatedAt: "desc" },
      }),
      db.product.findMany({
        where: { quantity: { gt: 0, lte: 15 } },
        select: { id: true, name: true, brand: true, quantity: true, minStock: true, sellingPrice: true, category: { select: { name: true } }, location: { select: { code: true } } },
        take: 50,
      }),
      db.product.findMany({
        select: {
          id: true, name: true, brand: true, oemNumber: true,
          quantity: true, sellingPrice: true,
          createdAt: true, updatedAt: true,
          categoryId: true, locationId: true,
          category: { select: { name: true } },
          location: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.movement.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          product: { select: { id: true, name: true } },
          user: { select: { name: true } },
        },
      }),
      // Lightweight: only 3 cols, no joins for stock-value calc
      db.product.findMany({
        select: { quantity: true, sellingPrice: true, purchasePrice: true },
      }),

      // Today's activity
      db.movement.findMany({
        where: { createdAt: { gte: startOfDay } },
        include: { product: { select: { name: true } } },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: startOfDay } },
        include: {
          items: { take: 1, select: { name: true } },
          customer: { select: { id: true, name: true, type: true, phone: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.customer.findMany({
        select: { outstanding: true, advance: true },
      }),

      // Category breakdown
      db.product.groupBy({
        by: ["categoryId"],
        _count: true,
        _sum: { quantity: true },
      }),
      // Fetch all category names upfront (avoids a dependent sequential query)
      db.category.findMany({ select: { id: true, name: true } }),
    ]);

    // ---- Compute derived values in JS (no more DB queries) ----
    const lowStock = lowStockRows.filter((p) => p.quantity <= p.minStock);
    const totalProducts = countAgg._count;
    const totalQuantity = countAgg._sum.quantity || 0;
    const stockValue = priceRows.reduce(
      (s, p) => s + p.quantity * p.sellingPrice,
      0
    );
    const purchaseValue = priceRows.reduce(
      (s, p) => s + p.quantity * p.purchasePrice,
      0
    );

    const stockInToday = todayMovements
      .filter((m) => m.type === "ADDED" && m.reason === "Stock in")
      .reduce((s, m) => s + m.quantity, 0);
    const stockOutToday = todayMovements
      .filter((m) => m.type === "REMOVED")
      .reduce((s, m) => s + Math.abs(m.quantity), 0);

    const todaySalesCount = todaySales.length;
    const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
    const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
    const todayCashTotal = todaySales.reduce((s, x) => s + x.cashAmount, 0);
    const todayUpiTotal = todaySales.reduce((s, x) => s + x.upiAmount, 0);
    const todayCreditTotal = todaySales.reduce((s, x) => s + x.creditAmount, 0);

    const totalOutstanding = allCustomers.reduce(
      (s, c) => s + (c.outstanding || 0),
      0
    );

    const catNameById = new Map(allCategories.map((c) => [c.id, c.name]));
    const categoryBreakdown = grouped.map((g) => ({
      name: (g.categoryId && catNameById.get(g.categoryId)) || "Uncategorized",
      count: g._count,
      quantity: g._sum.quantity || 0,
    })).sort((a, b) => b.count - a.count);

    return cachedOk({
      stats: {
        totalProducts,
        totalQuantity,
        outOfStockCount,
        lowStockCount: lowStock.length,
        stockValue,
        purchaseValue,
        categories: categoryCount,
        locations: locationCount,
        occupiedLocations: occupiedLocationsCount,
        stockInToday,
        stockOutToday,
        todaySalesCount,
        todayRevenue,
        todayProfit,
        todayCashTotal,
        todayUpiTotal,
        todayCreditTotal,
        totalOutstanding,
      },
      outOfStock,
      lowStock,
      recentProducts,
      recentMovements,
      recentSales: todaySales,
      categoryBreakdown,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to fetch dashboard", 500);
  }
}
