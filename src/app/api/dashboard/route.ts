import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { NextResponse } from "next/server";

// Cache the dashboard response in the browser for 30s (with SWR up to 5 min).
// Authenticated + cookie-scoped, so it's safe to cache privately.
function cachedOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
    },
  });
}

export async function GET() {
  try {
    await requireUser();

    // ---- Optimized: use DB aggregation instead of loading every product ----
    // Old code did findMany({ include: { category, location } }) on ALL products
    // just to count/sum — that loaded the entire inventory on every dashboard
    // load. Now we run cheap aggregate/count queries + only fetch the handful
    // of rows we actually need for display lists.
    const [
      countAgg,
      outOfStockCount,
      occupiedLocationsCount,
      categories,
      locations,
    ] = await Promise.all([
      db.product.aggregate({ _count: true, _sum: { quantity: true } }),
      db.product.count({ where: { quantity: { lte: 0 } } }),
      db.product.count({ where: { locationId: { not: null } } }),
      db.category.count(),
      db.location.count(),
    ]);

    // Fetch the small lists we need for display (capped, with joins).
    // priceRows is the only "all products" read — but only 3 columns, no joins.
    const [outOfStock, lowStockRows, recentProducts, recentMovements, priceRows] =
      await Promise.all([
        db.product.findMany({
          where: { quantity: { lte: 0 } },
          include: { category: true, location: true },
          take: 50,
          orderBy: { updatedAt: "desc" },
        }),
        // Low-stock: quantity > 0 and <= minStock — needs a where on minStock
        // comparison, which Prisma can't express directly on SQLite. We fetch
        // only the columns we need for the small set that's potentially low.
        db.product.findMany({
          where: { quantity: { gt: 0, lte: 15 } },
          select: { id: true, name: true, brand: true, quantity: true, minStock: true, sellingPrice: true, category: { select: { name: true } }, location: { select: { code: true } } },
          take: 50,
        }),
        db.product.findMany({
          include: { category: true, location: true },
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
        // Only qty + prices for stock value calc (3 cols, no joins — cheap)
        db.product.findMany({
          select: { quantity: true, sellingPrice: true, purchasePrice: true },
        }),
      ]);

    const lowStock = lowStockRows.filter((p) => p.quantity <= p.minStock);
    const totalProducts = countAgg._count;
    const totalQuantity = countAgg._sum.quantity || 0;

    // Stock value: sum(quantity * price). Prisma can't multiply in aggregate,
    // so we compute in JS from the lightweight priceRows query above.
    const stockValue = priceRows.reduce(
      (s, p) => s + p.quantity * p.sellingPrice,
      0
    );
    const purchaseValue = priceRows.reduce(
      (s, p) => s + p.quantity * p.purchasePrice,
      0
    );

    // Today's activity (movements today)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayMovements = await db.movement.findMany({
      where: { createdAt: { gte: startOfDay } },
      include: { product: { select: { name: true } } },
    });
    const stockInToday = todayMovements
      .filter((m) => m.type === "ADDED" && m.reason === "Stock in")
      .reduce((s, m) => s + m.quantity, 0);
    const stockOutToday = todayMovements
      .filter((m) => m.type === "REMOVED")
      .reduce((s, m) => s + Math.abs(m.quantity), 0);

    // Today's sales summary (with payment breakdown)
    const todaySales = await db.sale.findMany({
      where: { createdAt: { gte: startOfDay } },
      include: {
        items: { take: 1, select: { name: true } },
        customer: { select: { id: true, name: true, type: true, phone: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const todaySalesCount = todaySales.length;
    const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
    const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
    const todayCashTotal = todaySales.reduce((s, x) => s + x.cashAmount, 0);
    const todayUpiTotal = todaySales.reduce((s, x) => s + x.upiAmount, 0);
    const todayCreditTotal = todaySales.reduce((s, x) => s + x.creditAmount, 0);

    // Total outstanding (all customers)
    const allCustomers = await db.customer.findMany({
      select: { outstanding: true, advance: true },
    });
    const totalOutstanding = allCustomers.reduce(
      (s, c) => s + (c.outstanding || 0),
      0
    );

    // Category breakdown via groupBy (one DB round instead of loading all products)
    const grouped = await db.product.groupBy({
      by: ["categoryId"],
      _count: true,
      _sum: { quantity: true },
    });
    const catIds = grouped.map((g) => g.categoryId).filter(Boolean) as string[];
    const cats = catIds.length
      ? await db.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : [];
    const catNameById = new Map(cats.map((c) => [c.id, c.name]));
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
        categories,
        locations,
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
