import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, extractJSON, getShopSnapshot, aiErrorMessage, hasAIProvider } from "@/lib/ai";

type Insights = {
  generatedAt: string;
  purchaseList: {
    productId: string;
    name: string;
    brand: string;
    currentQty: number;
    suggestedQty: number;
    reason: string;
  }[];
  deadStock: {
    productId: string;
    name: string;
    brand: string;
    qty: number;
    daysUnsold: number;
    suggestion: string;
  }[];
  predictions: {
    productId: string;
    name: string;
    currentQty: number;
    avgDailySale: number;
    daysRemaining: number;
    recommendation: string;
  }[];
  recommendations: {
    title: string;
    detail: string;
    relatedProductIds: string[];
  }[];
  summary: string;
};

// GET /api/ai/insights — generate comprehensive AI insights (cached 5 min via SWR on client)
export async function GET() {
  try {
    await requireUser();

    const [snapshot, products, sales30] = await Promise.all([
      getShopSnapshot(),
      db.product.findMany({
        include: { category: { select: { name: true } }, location: { select: { code: true } } },
      }),
      db.saleItem.findMany({
        where: { sale: { createdAt: { gte: new Date(Date.now() - 29 * 86400000) } } },
        select: { productId: true, name: true, quantity: true, subtotal: true, sale: { select: { createdAt: true } } },
      }),
    ]);

    // Compute per-product sales stats over last 30 days
    const stats = new Map<string, { qty: number; revenue: number; lastSale: Date | null }>();
    for (const it of sales30) {
      const cur = stats.get(it.productId) || { qty: 0, revenue: 0, lastSale: null };
      cur.qty += it.quantity;
      cur.revenue += it.subtotal;
      if (!cur.lastSale || it.sale.createdAt > cur.lastSale) cur.lastSale = it.sale.createdAt;
      stats.set(it.productId, cur);
    }

    const now = new Date();
    const compact = products.map((p) => {
      const s = stats.get(p.id);
      const lastSold = p.lastSoldAt || s?.lastSale || null;
      const daysUnsold = lastSold
        ? Math.floor((now.getTime() - new Date(lastSold).getTime()) / 86400000)
        : 999;
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category?.name || "",
        location: p.location?.code || "",
        qty: p.quantity,
        minStock: p.minStock,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        supplier: p.supplier,
        sold30: s?.qty || 0,
        revenue30: s?.revenue || 0,
        avgDailySale: ((s?.qty || 0) / 30),
        daysUnsold,
      };
    });

    // Pre-filter to send only relevant products to AI (reduces prompt size 10x)
    const lowStockItems = compact
      .filter((p) => p.qty <= p.minStock)
      .slice(0, 15);
    const deadStockItems = compact
      .filter((p) => p.daysUnsold > 60)
      .slice(0, 15);
    const topSellers = compact
      .filter((p) => p.sold30 > 0)
      .sort((a, b) => b.sold30 - a.sold30)
      .slice(0, 15);

    const aiData = {
      stats: {
        totalProducts: snapshot.totals.products,
        units: snapshot.totals.units,
        outOfStock: snapshot.totals.outOfStock,
        lowStock: snapshot.totals.lowStock,
        todaySales: snapshot.sales.todayCount,
        todayRevenue: Math.round(snapshot.sales.todayRevenue),
        weekSales: snapshot.sales.weekCount,
        weekRevenue: Math.round(snapshot.sales.weekRevenue),
      },
      lowStock: lowStockItems.map((p) => ({ id: p.id, name: p.name, brand: p.brand, qty: p.qty, minStock: p.minStock, avgDailySale: Number(p.avgDailySale.toFixed(2)) })),
      deadStock: deadStockItems.map((p) => ({ id: p.id, name: p.name, brand: p.brand, qty: p.qty, daysUnsold: p.daysUnsold === 999 ? 999 : p.daysUnsold })),
      topSellers: topSellers.map((p) => ({ id: p.id, name: p.name, brand: p.brand, qty: p.qty, sold30: p.sold30, avgDailySale: Number(p.avgDailySale.toFixed(2)), daysRemaining: p.avgDailySale > 0 ? Math.floor(p.qty / p.avgDailySale) : 999 })),
    };

    const systemPrompt = `You are an AI business analyst for a bike spare-parts shop in rural Bihar (shop: ${snapshot.shopName}). Analyze this data and produce actionable insights in Hinglish.

Data (JSON):
${JSON.stringify(aiData)}

Respond with ONLY valid JSON (no markdown):
{
  "purchaseList": [{ "productId": "...", "name": "...", "brand": "...", "currentQty": N, "suggestedQty": N, "reason": "Hinglish reason" }],
  "deadStock": [{ "productId": "...", "name": "...", "brand": "...", "qty": N, "daysUnsold": N, "suggestion": "Hinglish suggestion" }],
  "predictions": [{ "productId": "...", "name": "...", "currentQty": N, "avgDailySale": N, "daysRemaining": N, "recommendation": "Hinglish" }],
  "recommendations": [{ "title": "...", "detail": "Hinglish", "relatedProductIds": [] }],
  "summary": "3-5 line Hinglish summary"
}

Rules:
- purchaseList: low/out of stock items + items running out in <7 days
- deadStock: unsold >60 days, suggest discount/display/return
- predictions: top sellers, warn if <10 days stock left
- recommendations: cross-sell, location tips
- Keep Hinglish text SHORT.`;

    const raw = await chat(systemPrompt, "Generate today's shop insights.");
    const parsed = extractJSON<Insights>(raw);

    // Compute local insights (used as fallback when AI is unavailable or returns invalid JSON)
    const localInsights: Insights = {
      generatedAt: new Date().toISOString(),
      purchaseList: compact
        .filter((p) => p.qty <= p.minStock)
        .slice(0, 10)
        .map((p) => ({
          productId: p.id, name: p.name, brand: p.brand,
          currentQty: p.qty, suggestedQty: Math.max(p.minStock * 2, 10),
          reason: `Stock kam hai (${p.qty} units, min ${p.minStock}). Restock zaroori.`,
        })),
      deadStock: compact
        .filter((p) => p.daysUnsold > 60)
        .slice(0, 10)
        .map((p) => ({
          productId: p.id, name: p.name, brand: p.brand,
          qty: p.qty, daysUnsold: p.daysUnsold === 999 ? 0 : p.daysUnsold,
          suggestion:
            (p.daysUnsold === 999
              ? "Kabhi nahi bike"
              : p.daysUnsold + " din se nahi bike") +
            ". Discount ya display par lagao.",
        })),
      predictions: compact
        .filter((p) => p.avgDailySale > 0)
        .map((p) => ({
          productId: p.id, name: p.name, currentQty: p.qty,
          avgDailySale: Number(p.avgDailySale.toFixed(2)),
          daysRemaining: Math.floor(p.qty / p.avgDailySale),
          recommendation: p.qty / p.avgDailySale < 10 ? "Jaldi order karein" : "Stock theek hai",
        }))
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 10),
      recommendations: [],
      summary: `${snapshot.totals.products} products, ${snapshot.totals.lowStock} low stock, ${snapshot.totals.outOfStock} out of stock. Aaj ${snapshot.sales.todayCount} sale, ₹${Math.round(snapshot.sales.todayRevenue)} revenue. ${snapshot.totals.lowStock > 0 ? "Restock par dhyan dein." : "Stock achha hai."}`,
    };

    if (!parsed) {
      const hasAI = await hasAIProvider();
      return ok({
        ...localInsights,
        summary: hasAI
          ? "AI response parse nahi hua. Basic computed insights dikha rahe hain."
          : "AI provider configure nahi hai (GROQ_API_KEY set karein better insights ke liye). Basic computed insights:",
      } as Insights);
    }

    return ok({ ...parsed, generatedAt: new Date().toISOString() });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Insights error:", e);
    return err(aiErrorMessage(e, "Failed to generate insights"), 500);
  }
}
