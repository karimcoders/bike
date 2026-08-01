import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, extractJSON, getShopSnapshot, aiErrorMessage } from "@/lib/ai";

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

    const systemPrompt = `You are an AI business analyst for a bike spare-parts shop in rural Bihar (shop: ${snapshot.shopName}). Analyze the inventory and sales data and produce actionable insights in Hinglish.

Shop snapshot: ${snapshot.totals.products} products, ${snapshot.totals.units} units, ${snapshot.totals.outOfStock} out of stock, ${snapshot.totals.lowStock} low stock. Today: ${snapshot.sales.todayCount} sales, ₹${Math.round(snapshot.sales.todayRevenue)} revenue. This week: ${snapshot.sales.weekCount} sales, ₹${Math.round(snapshot.sales.weekRevenue)} revenue.

Product data (JSON):
${JSON.stringify(compact)}

Respond with ONLY valid JSON (no markdown) in this exact format:
{
  "purchaseList": [
    { "productId": "...", "name": "...", "brand": "...", "currentQty": number, "suggestedQty": number, "reason": "Hinglish reason why to buy" }
  ],
  "deadStock": [
    { "productId": "...", "name": "...", "brand": "...", "qty": number, "daysUnsold": number, "suggestion": "Hinglish suggestion (discount / move to display / return)" }
  ],
  "predictions": [
    { "productId": "...", "name": "...", "currentQty": number, "avgDailySale": number, "daysRemaining": number, "recommendation": "Hinglish recommendation" }
  ],
  "recommendations": [
    { "title": "short title", "detail": "Hinglish detail", "relatedProductIds": ["id1", "id2"] }
  ],
  "summary": "3-5 line Hinglish summary of the shop's health"
}

Rules:
- purchaseList: products that are low/out of stock OR will run out in <7 days based on avgDailySale. Suggest a reasonable qty to buy.
- deadStock: products with daysUnsold > 60 (or never sold). Suggest discount, display move, or return.
- predictions: for top-selling products, compute daysRemaining = currentQty / avgDailySale (if avgDailySale > 0). Warn if < 10 days.
- recommendations: cross-sell suggestions, location optimization, etc.
- Keep all Hinglish text short and practical.`;

    const raw = await chat(systemPrompt, "Generate today's shop insights.");
    const parsed = extractJSON<Insights>(raw);

    if (!parsed) {
      // Fallback: compute basic insights without AI
      return ok({
        generatedAt: new Date().toISOString(),
        purchaseList: compact
          .filter((p) => p.qty <= p.minStock)
          .slice(0, 10)
          .map((p) => ({
            productId: p.id, name: p.name, brand: p.brand,
            currentQty: p.qty, suggestedQty: p.minStock * 2,
            reason: "Low stock — restock needed",
          })),
        deadStock: compact
          .filter((p) => p.daysUnsold > 60)
          .slice(0, 10)
          .map((p) => ({
            productId: p.id, name: p.name, brand: p.brand,
            qty: p.qty, daysUnsold: p.daysUnsold,
            suggestion: "Long unsold — consider discount",
          })),
        predictions: compact
          .filter((p) => p.avgDailySale > 0)
          .map((p) => ({
            productId: p.id, name: p.name, currentQty: p.qty,
            avgDailySale: Number(p.avgDailySale.toFixed(2)),
            daysRemaining: Math.floor(p.qty / p.avgDailySale),
            recommendation: p.qty / p.avgDailySale < 10 ? "Order soon" : "Stock OK",
          }))
          .sort((a, b) => a.daysRemaining - b.daysRemaining)
          .slice(0, 10),
        recommendations: [],
        summary: "AI summary unavailable. Showing basic computed insights.",
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
