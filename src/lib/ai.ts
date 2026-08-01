import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "./db";

// =====================================================================
// ZAI API Configuration (Vercel-compatible)
// ---------------------------------------------------------------------
// Reads ZAI credentials from environment variables FIRST, then falls
// back to the .z-ai-config file (for local sandbox dev).
//
// Required env vars (for Vercel/production):
//   ZAI_API_KEY  — API key (e.g. "Z.ai")
//   ZAI_BASE_URL — base URL (e.g. "https://internal-api.z.ai/v1")
//   ZAI_TOKEN    — session JWT token
//   ZAI_CHAT_ID  — chat ID (optional but recommended)
//   ZAI_USER_ID  — user ID (optional but recommended)
//
// In the dev sandbox, /etc/.z-ai-config is pre-provisioned and will
// be used automatically if env vars are not set.
// =====================================================================

type ZAIConfig = {
  baseUrl: string;
  apiKey: string;
  token?: string;
  chatId?: string;
  userId?: string;
};

let _cachedConfig: ZAIConfig | null = null;

export async function loadZAIConfig(): Promise<ZAIConfig> {
  if (_cachedConfig) return _cachedConfig;

  // ---- 1. Try env vars first (Vercel/production) ----
  if (process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL) {
    _cachedConfig = {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      token: process.env.ZAI_TOKEN,
      chatId: process.env.ZAI_CHAT_ID,
      userId: process.env.ZAI_USER_ID,
    };
    return _cachedConfig;
  }

  // ---- 2. Fall back to .z-ai-config file (local sandbox) ----
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(os.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];

  for (const p of configPaths) {
    try {
      const content = await fs.readFile(p, "utf-8");
      const cfg = JSON.parse(content);
      if (cfg.baseUrl && cfg.apiKey) {
        _cachedConfig = {
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          token: cfg.token,
          chatId: cfg.chatId,
          userId: cfg.userId,
        };
        return _cachedConfig;
      }
    } catch {
      // file doesn't exist or is invalid — continue
    }
  }

  throw new Error(
    "ZAI configuration missing. Set ZAI_API_KEY + ZAI_BASE_URL + ZAI_TOKEN env vars, or create .z-ai-config file."
  );
}

function buildHeaders(cfg: ZAIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
    "X-Z-AI-From": "Z",
  };
  if (cfg.chatId) headers["X-Chat-Id"] = cfg.chatId;
  if (cfg.userId) headers["X-User-Id"] = cfg.userId;
  if (cfg.token) headers["X-Token"] = cfg.token;
  return headers;
}

// ---- Chat completion helper ----
export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const cfg = await loadZAIConfig();
  const messages: { role: string; content: string }[] = [
    { role: "assistant", content: systemPrompt },
    ...(opts?.history || []),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({
      messages,
      thinking: { type: "disabled" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ZAI chat failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ---- Vision chat helper (image_url or base64 data URL) ----
export async function visionChat(
  prompt: string,
  imageUrl: string
): Promise<string> {
  const cfg = await loadZAIConfig();

  const response = await fetch(`${cfg.baseUrl}/chat/completions/vision`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ZAI vision failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ---- ASR helper (base64 audio) ----
export async function transcribe(base64Audio: string): Promise<string> {
  const cfg = await loadZAIConfig();

  const response = await fetch(`${cfg.baseUrl}/audio/asr`, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({ file_base64: base64Audio }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ZAI ASR failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.text || "";
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
