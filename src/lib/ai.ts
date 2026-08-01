import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "./db";

// =====================================================================
// MULTI-PROVIDER AI CONFIGURATION
// ---------------------------------------------------------------------
// Supports two providers, auto-detected by env vars:
//
// 1. Google Gemini (RECOMMENDED for Vercel / production)
//    Env: GOOGLE_GENERATED_AI_API_KEY=AIza...
//    Free tier: 15 req/min, supports text + vision + audio
//    Get a key: https://aistudio.google.com/app/apikey
//
// 2. Z.ai SDK (used in dev sandbox, auto-detected via /etc/.z-ai-config)
//    Env: ZAI_API_KEY + ZAI_BASE_URL + ZAI_TOKEN
//    (or rely on the pre-provisioned /etc/.z-ai-config file)
//
// If neither is configured, AI routes return a clear actionable error.
// =====================================================================

const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_VISION_MODEL = "gemini-2.5-flash";

// =====================================================================
// ZAI Config (sandbox only)
// =====================================================================
type ZAIConfig = {
  baseUrl: string;
  apiKey: string;
  token?: string;
  chatId?: string;
  userId?: string;
};

let _cachedZAIConfig: ZAIConfig | null = null;
let _zaiChecked = false;

async function loadZAIConfig(): Promise<ZAIConfig | null> {
  if (_zaiChecked) return _cachedZAIConfig;
  _zaiChecked = true;

  // 1. Try env vars
  if (process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL) {
    _cachedZAIConfig = {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      token: process.env.ZAI_TOKEN,
      chatId: process.env.ZAI_CHAT_ID,
      userId: process.env.ZAI_USER_ID,
    };
    return _cachedZAIConfig;
  }

  // 2. Fall back to .z-ai-config file (local sandbox)
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
        _cachedZAIConfig = {
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          token: cfg.token,
          chatId: cfg.chatId,
          userId: cfg.userId,
        };
        return _cachedZAIConfig;
      }
    } catch {
      // file doesn't exist or is invalid — continue
    }
  }

  return null;
}

function buildZAIHeaders(cfg: ZAIConfig): Record<string, string> {
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

// =====================================================================
// Error helpers
// =====================================================================
export class AIConfigError extends Error {
  constructor() {
    super(
      "AI service not configured. Set the GOOGLE_GENERATED_AI_API_KEY environment variable " +
        "(get a free key at https://aistudio.google.com/app/apikey). " +
        "In the dev sandbox, Z.ai is auto-detected."
    );
    this.name = "AIConfigError";
  }
}

// Helper for route handlers to return a useful error message to the client.
export function aiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof AIConfigError) return e.message;
  // Surface provider errors too — they usually tell the user what's wrong
  // (e.g. "Gemini chat failed: 401 invalid api key")
  if (e instanceof Error && e.message) {
    const m = e.message;
    if (
      m.includes("not configured") ||
      m.includes("GOOGLE_GENERATED_AI_API_KEY") ||
      m.includes("invalid api key") ||
      m.includes("API key not valid")
    ) {
      return m.slice(0, 300);
    }
  }
  return fallback;
}

function isConfigured(): boolean {
  return !!process.env.GOOGLE_GENERATED_AI_API_KEY;
}

// =====================================================================
// PUBLIC: chat() — text chat completion
// =====================================================================
export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  if (isConfigured()) {
    return chatGemini(systemPrompt, userMessage, opts);
  }
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return chatZAI(zaiCfg, systemPrompt, userMessage, opts);
  throw new AIConfigError();
}

async function chatGemini(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
  const messages: {
    role: string;
    content: string;
  }[] = [
    { role: "system", content: systemPrompt },
    ...(opts?.history || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(`${GEMINI_OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GEMINI_TEXT_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Gemini chat failed: ${response.status} ${text.slice(0, 300)}`
    );
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function chatZAI(
  cfg: ZAIConfig,
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: "assistant", content: systemPrompt },
    ...(opts?.history || []),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildZAIHeaders(cfg),
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

// =====================================================================
// PUBLIC: visionChat() — image + text → text
// =====================================================================
export async function visionChat(
  prompt: string,
  imageUrl: string
): Promise<string> {
  if (isConfigured()) {
    return visionChatGemini(prompt, imageUrl);
  }
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return visionChatZAI(zaiCfg, prompt, imageUrl);
  throw new AIConfigError();
}

async function visionChatGemini(
  prompt: string,
  imageUrl: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
  // Gemini's OpenAI-compatible endpoint supports image_url with data URLs
  // (data:image/...;base64,...) and also https URLs.
  const response = await fetch(`${GEMINI_OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GEMINI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Gemini vision failed: ${response.status} ${text.slice(0, 300)}`
    );
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function visionChatZAI(
  cfg: ZAIConfig,
  prompt: string,
  imageUrl: string
): Promise<string> {
  const response = await fetch(`${cfg.baseUrl}/chat/completions/vision`, {
    method: "POST",
    headers: buildZAIHeaders(cfg),
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

// =====================================================================
// PUBLIC: transcribe() — base64 audio → text
// =====================================================================
export async function transcribe(base64Audio: string): Promise<string> {
  if (isConfigured()) {
    return transcribeGemini(base64Audio);
  }
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return transcribeZAI(zaiCfg, base64Audio);
  throw new AIConfigError();
}

async function transcribeGemini(base64Audio: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
  // Normalize to a data URL so we can extract mime + payload
  let mime = "audio/webm";
  let data = base64Audio;
  if (base64Audio.startsWith("data:")) {
    const m = base64Audio.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      mime = m[1];
      data = m[2];
    }
  }

  // Use the NATIVE Gemini API for audio (more reliable than the OpenAI shim)
  const response = await fetch(
    `${GEMINI_NATIVE_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Transcribe this audio exactly as spoken. Reply with ONLY the transcribed text, no extra commentary." },
              { inline_data: { mime_type: mime, data } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Gemini ASR failed: ${response.status} ${text.slice(0, 300)}`
    );
  }
  const data2 = await response.json();
  const parts = data2.candidates?.[0]?.content?.parts || [];
  const transcript = parts
    .map((p: any) => p?.text || "")
    .join("")
    .trim();
  return transcript;
}

async function transcribeZAI(
  cfg: ZAIConfig,
  base64Audio: string
): Promise<string> {
  const response = await fetch(`${cfg.baseUrl}/audio/asr`, {
    method: "POST",
    headers: buildZAIHeaders(cfg),
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
