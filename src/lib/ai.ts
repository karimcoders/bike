// =====================================================================
// AI LIBRARY — thin wrapper over the Enterprise AI Gateway (ai-router.ts)
// ---------------------------------------------------------------------
// Keeps the existing API (chat, visionChat, transcribe, etc.) so route
// files don't need changes, but delegates to the smart router which:
//   - Routes DB-able queries directly to the database (instant, free)
//   - Falls back across providers: Groq → Gemini → Z.ai → Local
//   - Tracks usage and handles rate limits
// =====================================================================

import {
  smartChat,
  smartVisionChat,
  smartTranscribe,
  searchProductsLocal as _searchProductsLocal,
  hasAIProvider as _hasAIProvider,
  getUsageStats,
  detectIntent,
  resolveFromDB,
  type ProviderName,
} from "./ai-router";
import { db } from "./db";

// Re-export for routes that import from here
export { searchProductsLocal } from "./ai-router";
export { getUsageStats, detectIntent, resolveFromDB };
export type { ProviderName };

// =====================================================================
// Error helpers
// =====================================================================
export class AIConfigError extends Error {
  constructor() {
    super(
      "AI service not configured. Set ONE of these env vars:\n" +
        "  • GROQ_API_KEY (free, instant — https://console.groq.com/keys)\n" +
        "  • GOOGLE_GENERATED_AI_API_KEY (https://aistudio.google.com/app/apikey)\n" +
        "Note: DB queries (stock, prices, sales) work WITHOUT any AI key."
    );
    this.name = "AIConfigError";
  }
}

export function aiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof AIConfigError) return e.message;
  if (e instanceof Error && e.message) {
    const m = e.message;
    if (
      m.includes("not configured") ||
      m.includes("GROQ_API_KEY") ||
      m.includes("GOOGLE_GENERATED_AI_API_KEY") ||
      m.includes("No vision AI") ||
      m.includes("No transcription")
    ) {
      return m.slice(0, 300);
    }
  }
  return fallback;
}

export async function hasAIProvider(): Promise<boolean> {
  return _hasAIProvider();
}

// =====================================================================
// PUBLIC: chat() — now routes through the smart gateway
// =====================================================================
export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  // Try to get shop snapshot for DB-first routing
  let snapshot: any = null;
  try {
    snapshot = await getShopSnapshot();
  } catch {
    // ignore — will skip DB routing
  }

  const result = await smartChat(systemPrompt, userMessage, {
    history: opts?.history,
    shopSnapshot: snapshot,
  });

  // If the AI provider returned an empty reply but DB didn't catch it,
  // the router already fell back to local. Return what we got.
  return result.reply;
}

// =====================================================================
// PUBLIC: chatWithMeta() — returns reply + provider + intent (for UI badges)
// =====================================================================
export async function chatWithMeta(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<{ reply: string; provider: ProviderName; intentType: string }> {
  let snapshot: any = null;
  try {
    snapshot = await getShopSnapshot();
  } catch {
    // ignore
  }

  const result = await smartChat(systemPrompt, userMessage, {
    history: opts?.history,
    shopSnapshot: snapshot,
  });

  return {
    reply: result.reply,
    provider: result.provider,
    intentType: result.intent.type === "db" ? `db:${(result.intent as any).subtype}` : "ai",
  };
}

// =====================================================================
// PUBLIC: visionChat() — image + text → text (via router)
// =====================================================================
export async function visionChat(
  prompt: string,
  imageUrl: string
): Promise<string> {
  const result = await smartVisionChat(prompt, imageUrl);
  return result.result;
}

// =====================================================================
// PUBLIC: transcribe() — audio → text (via router)
// =====================================================================
export async function transcribe(base64Audio: string): Promise<string> {
  const result = await smartTranscribe(base64Audio);
  return result.transcript;
}

// =====================================================================
// JSON extraction helper (robust against markdown fences)
// =====================================================================
export function extractJSON<T = any>(text: string): T | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = -1;
  if (first === -1) start = firstArr;
  else if (firstArr === -1) start = first;
  else start = Math.min(first, firstArr);
  if (start === -1) return null;
  const isArr = t[start] === "[";
  const end = t.lastIndexOf(isArr ? "]" : "}");
  if (end === -1) return null;
  const slice = t.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

// ====================================================================
// SHOP CONTEXT BUILDERS — with in-memory cache
// ====================================================================

export type ShopSnapshot = {
  shopName: string;
  ownerName: string;
  totals: {
    products: number;
    units: number;
    outOfStock: number;
    lowStock: number;
    stockValue: number;
    categories: number;
    locations: number;
  };
  sales: {
    todayCount: number;
    todayRevenue: number;
    todayProfit: number;
    weekCount: number;
    weekRevenue: number;
  };
  topSellers: { name: string; brand: string; qty: number; revenue: number }[];
  recentSales: {
    product: string;
    qty: number;
    total: number;
    when: string;
  }[];
};

let _snapshotCache: { data: ShopSnapshot; ts: number } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

export async function getShopSnapshot(): Promise<ShopSnapshot> {
  if (_snapshotCache && Date.now() - _snapshotCache.ts < SNAPSHOT_TTL_MS) {
    return _snapshotCache.data;
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const totalProducts = await db.product.count();
  const agg = await db.product.aggregate({
    _sum: { quantity: true },
    _count: true,
  });
  const outOfStock = await db.product.count({ where: { quantity: { lte: 0 } } });
  const lowStock = await db.product.count({
    where: { quantity: { gt: 0, lte: 5 } },
  });

  const products = await db.product.findMany({
    select: { sellingPrice: true, quantity: true },
  });
  const stockValue = products.reduce(
    (s, p) => s + p.sellingPrice * p.quantity,
    0
  );

  const categories = await db.category.count();
  const locations = await db.location.count();

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday.getTime() - 6 * 86400000);

  const [todaySales, weekSales] = await Promise.all([
    db.sale.findMany({
      where: { createdAt: { gte: startToday } },
      select: { total: true, profit: true },
    }),
    db.sale.findMany({
      where: { createdAt: { gte: startWeek } },
      select: { total: true },
    }),
  ]);

  const sumRev = (sales: { total: number }[]) =>
    sales.reduce((s, x) => s + x.total, 0);
  const sumProfit = (sales: { profit: number }[]) =>
    sales.reduce((s, x) => s + x.profit, 0);

  const start30 = new Date(now.getTime() - 29 * 86400000);
  const recentItems = await db.saleItem.findMany({
    where: { sale: { createdAt: { gte: start30 } } },
    select: { name: true, quantity: true, subtotal: true, product: { select: { brand: true } } },
  });
  const topMap = new Map<string, { name: string; brand: string; qty: number; revenue: number }>();
  for (const it of recentItems) {
    const k = it.name;
    const cur = topMap.get(k) || { name: it.name, brand: it.product?.brand || "", qty: 0, revenue: 0 };
    cur.qty += it.quantity;
    cur.revenue += it.subtotal;
    topMap.set(k, cur);
  }
  const topSellers = Array.from(topMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const recent = await db.sale.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { items: { select: { name: true, quantity: true, subtotal: true } } },
  });
  const recentSales = recent.map((s) => ({
    product: s.items[0]?.name || "Multiple items",
    qty: s.items.reduce((a, b) => a + b.quantity, 0),
    total: s.total,
    when: s.createdAt.toISOString(),
  }));

  const snapshot: ShopSnapshot = {
    shopName: settings?.shopName || "Bike Shop",
    ownerName: settings?.ownerName || "Owner",
    totals: {
      products: totalProducts,
      units: agg._sum.quantity || 0,
      outOfStock,
      lowStock,
      stockValue,
      categories,
      locations,
    },
    sales: {
      todayCount: todaySales.length,
      todayRevenue: sumRev(todaySales),
      todayProfit: sumProfit(todaySales),
      weekCount: weekSales.length,
      weekRevenue: sumRev(weekSales),
    },
    topSellers,
    recentSales,
  };

  _snapshotCache = { data: snapshot, ts: Date.now() };
  return snapshot;
}

// Compact product list — cached 30s
let _catalogCache: { data: any[]; ts: number } | null = null;
const CATALOG_TTL_MS = 30_000;

export async function getProductCatalogForAI(limit = 120) {
  if (_catalogCache && Date.now() - _catalogCache.ts < CATALOG_TTL_MS && _catalogCache.data.length <= limit) {
    return _catalogCache.data;
  }

  const products = await db.product.findMany({
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      category: { select: { name: true } },
      location: { select: { code: true } },
    },
  });
  const catalog = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    oem: p.oemNumber,
    bikes: p.bikeModels,
    category: p.category?.name || "",
    location: p.location?.code || "",
    qty: p.quantity,
    minStock: p.minStock,
    purchasePrice: p.purchasePrice,
    sellingPrice: p.sellingPrice,
    supplier: p.supplier,
    lastSoldAt: p.lastSoldAt?.toISOString() || null,
  }));

  _catalogCache = { data: catalog, ts: Date.now() };
  return catalog;
}
