import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();

    const products = await db.product.findMany({
      include: { category: true, location: true },
    });

    const totalProducts = products.length;
    const totalQuantity = products.reduce((s, p) => s + p.quantity, 0);
    const outOfStock = products.filter((p) => p.quantity <= 0);
    const lowStock = products.filter(
      (p) => p.quantity > 0 && p.quantity <= p.minStock
    );
    const stockValue = products.reduce(
      (s, p) => s + p.quantity * p.sellingPrice,
      0
    );
    const purchaseValue = products.reduce(
      (s, p) => s + p.quantity * p.purchasePrice,
      0
    );

    const categories = await db.category.count();
    const locations = await db.location.count();
    const occupiedLocations = products.filter((p) => p.locationId).length;

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

    // Total outstanding (all customers) — compute manually to avoid Prisma
    // aggregate type issues with newly added Float fields
    const allCustomers = await db.customer.findMany({
      select: { outstanding: true, advance: true },
    });
    const totalOutstanding = allCustomers.reduce(
      (s, c) => s + (c.outstanding || 0),
      0
    );

    // Recent added products (last 5)
    const recentProducts = [...products]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    // Recent movements (last 8)
    const recentMovements = await db.movement.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        product: { select: { id: true, name: true } },
        user: { select: { name: true } },
      },
    });

    // Category breakdown
    const categoryBreakdown = products.reduce<
      Record<string, { name: string; count: number; quantity: number }>
    >((acc, p) => {
      const name = p.category?.name || "Uncategorized";
      if (!acc[name])
        acc[name] = { name, count: 0, quantity: 0 };
      acc[name].count += 1;
      acc[name].quantity += p.quantity;
      return acc;
    }, {});

    return ok({
      stats: {
        totalProducts,
        totalQuantity,
        outOfStockCount: outOfStock.length,
        lowStockCount: lowStock.length,
        stockValue,
        purchaseValue,
        categories,
        locations,
        occupiedLocations,
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
      categoryBreakdown: Object.values(categoryBreakdown).sort(
        (a, b) => b.count - a.count
      ),
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to fetch dashboard", 500);
  }
}
