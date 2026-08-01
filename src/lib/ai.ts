import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "./db";

// =====================================================================
// ZAI SDK Configuration
// ---------------------------------------------------------------------
// The z-ai-web-dev-sdk reads its config from a .z-ai-config JSON file
// (searched in cwd, home dir, /etc). In the dev sandbox this file is
// pre-provisioned at /etc/.z-ai-config.
//
// For production deployments (Railway, Vercel, etc.) where we can't
// ship a config file, we support env vars as a fallback:
//   ZAI_API_KEY  — the API key
//   ZAI_BASE_URL — the base URL (defaults to https://api.z.ai/v1)
//
// If .z-ai-config doesn't exist but ZAI_API_KEY is set, we auto-create
// a config file in the project root so the SDK can find it.
// =====================================================================

async function ensureZAIConfig(): Promise<void> {
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(os.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];

  // Check if any existing config file is valid
  for (const p of configPaths) {
    try {
      const content = await fs.readFile(p, "utf-8");
      const cfg = JSON.parse(content);
      if (cfg.baseUrl && cfg.apiKey) return; // valid config exists
    } catch {
      // file doesn't exist or is invalid — continue
    }
  }

  // No valid config file found — try to create one from env vars
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ZAI configuration missing. Either create a .z-ai-config file with {baseUrl, apiKey} or set ZAI_API_KEY environment variable."
    );
  }

  const baseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/v1";
  const config = JSON.stringify({ baseUrl, apiKey });
  const targetPath = path.join(process.cwd(), ".z-ai-config");
  await fs.writeFile(targetPath, config, "utf-8");
}

// Singleton ZAI instance
let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
export async function getZAI() {
  if (!_zai) {
    await ensureZAIConfig();
    _zai = await ZAI.create();
  }
  return _zai;
}

// ---- Chat completion helper ----
export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const zai = await getZAI();
  const messages: { role: string; content: string }[] = [
    { role: "assistant", content: systemPrompt },
    ...(opts?.history || []),
    { role: "user", content: userMessage },
  ];
  const completion = await zai.chat.completions.create({
    messages: messages as any,
    thinking: { type: "disabled" },
  });
  return completion.choices[0]?.message?.content || "";
}

// ---- Vision chat helper (image_url or base64 data URL) ----
export async function visionChat(
  prompt: string,
  imageUrl: string
): Promise<string> {
  const zai = await getZAI();
  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  } as any);
  return response.choices[0]?.message?.content || "";
}

// ---- ASR helper (base64 audio) ----
export async function transcribe(base64Audio: string): Promise<string> {
  const zai = await getZAI();
  const response = await zai.audio.asr.create({
    file_base64: base64Audio,
  } as any);
  return response.text || "";
}

// ---- JSON extraction helper (robust against markdown fences) ----
export function extractJSON<T = any>(text: string): T | null {
  if (!text) return null;
  // strip markdown code fences
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // find first { ... last }
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
// SHOP CONTEXT BUILDERS — feed real DB data to the AI
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

export async function getShopSnapshot(): Promise<ShopSnapshot> {
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
  const stockValueAgg = await db.product.aggregate({
    _sum: { sellingPrice: true, quantity: true },
  });
  const stockValue =
    (stockValueAgg._sum.sellingPrice || 0) * 0 + // placeholder
    (await db.product
      .findMany({ select: { sellingPrice: true, quantity: true } })
      .then((ps) =>
        ps.reduce((s, p) => s + p.sellingPrice * p.quantity, 0)
      ));
  const categories = await db.category.count();
  const locations = await db.location.count();

  // Sales: today & this week
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday.getTime() - 6 * 86400000);

  const todaySales = await db.sale.findMany({
    where: { createdAt: { gte: startToday } },
    include: { items: true },
  });
  const weekSales = await db.sale.findMany({
    where: { createdAt: { gte: startWeek } },
    include: { items: true },
  });

  const sumRev = (sales: (typeof todaySales)[number][]) =>
    sales.reduce((s, x) => s + x.total, 0);
  const sumProfit = (sales: (typeof todaySales)[number][]) =>
    sales.reduce((s, x) => s + x.profit, 0);

  // Top sellers from last 30 days
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

  // Recent sales (last 10)
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

  return {
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
}

// Compact product list for AI context (avoid huge payloads)
export async function getProductCatalogForAI(limit = 120) {
  const products = await db.product.findMany({
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      category: { select: { name: true } },
      location: { select: { code: true } },
    },
  });
  return products.map((p) => ({
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
}
