import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { db } from "./db";

// =====================================================================
// MULTI-PROVIDER AI CONFIGURATION (with LOCAL FALLBACK)
// ---------------------------------------------------------------------
// Provider priority (auto-detected):
//
// 1. Google Gemini   — env: GOOGLE_GENERATED_AI_API_KEY  (text+vision+audio)
// 2. Groq            — env: GROQ_API_KEY                 (text only, SUPER FAST)
//                      Get free key: https://console.groq.com/keys
//                      (sign in with Google/GitHub, instant, 30 req/min free)
// 3. Z.ai sandbox    — auto-detected via /etc/.z-ai-config (dev sandbox only)
// 4. LOCAL FALLBACK  — no API key needed, uses shop data + simple rules
//                      (instant, works everywhere, limited intelligence)
//
// Vision features (photo recognition, OCR) need Gemini or Z.ai.
// Text features (chat, search, insights) work with any provider,
// including the local fallback.
// =====================================================================

const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_VISION_MODEL = "gemini-2.5-flash";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// =====================================================================
// Provider detection
// =====================================================================
function hasGemini(): boolean {
  return !!process.env.GOOGLE_GENERATED_AI_API_KEY;
}
function hasGroq(): boolean {
  return !!process.env.GROQ_API_KEY;
}

// ZAI Config (sandbox only)
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

// Returns true if ANY real AI provider is available (Gemini / Groq / ZAI)
export async function hasAIProvider(): Promise<boolean> {
  if (hasGemini() || hasGroq()) return true;
  const zai = await loadZAIConfig();
  return !!zai;
}

// =====================================================================
// Error helpers
// =====================================================================
export class AIConfigError extends Error {
  constructor() {
    super(
      "AI service not configured. To enable AI features, set ONE of these env vars:\n" +
        "  • GROQ_API_KEY          (recommended, free, instant signup — https://console.groq.com/keys)\n" +
        "  • GOOGLE_GENERATED_AI_API_KEY  (https://aistudio.google.com/app/apikey)\n" +
        "In the dev sandbox, Z.ai is auto-detected."
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
      m.includes("GOOGLE_GENERATED_AI_API_KEY") ||
      m.includes("GROQ_API_KEY") ||
      m.includes("invalid api key") ||
      m.includes("API key not valid")
    ) {
      return m.slice(0, 300);
    }
  }
  return fallback;
}

// =====================================================================
// PUBLIC: chat() — text chat completion
// =====================================================================
export async function chat(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  if (hasGemini()) return chatGemini(systemPrompt, userMessage, opts);
  if (hasGroq()) return chatGroq(systemPrompt, userMessage, opts);
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return chatZAI(zaiCfg, systemPrompt, userMessage, opts);
  // No provider — use local fallback (instant, rule-based)
  return chatLocal(systemPrompt, userMessage);
}

async function chatGemini(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
  const messages = [
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
    throw new Error(`Gemini chat failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function chatGroq(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY!;
  const messages = [
    { role: "system", content: systemPrompt },
    ...(opts?.history || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Groq chat failed: ${response.status} ${text.slice(0, 300)}`);
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
  const messages = [
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

// ---- LOCAL FALLBACK CHAT (no API key needed) ----
// Uses shop data + simple keyword matching to answer common questions.
// Instant, free, works everywhere. Limited intelligence but very practical.
async function chatLocal(systemPrompt: string, userMessage: string): Promise<string> {
  const msg = userMessage.toLowerCase().trim();
  try {
    const snapshot = await getShopSnapshot();

    // Greeting detection
    if (/^(hi|hello|hey|namaste|salaam|assalam)\b/.test(msg)) {
      return `Namaste! Main ShopMitra hoon, ${snapshot.shopName} ka assistant. Aap puchh sakte hain:\n• "aaj kitne sale hue?"\n• "stock value kya hai?"\n• "low stock parts batao"\n• "top selling products"\n\nNote: Advanced AI (Groq/Gemini) configure karein better answers ke liye.`;
    }

    // Today's sales
    if (msg.includes("aaj") && (msg.includes("sale") || msg.includes("bikri") || msg.includes("sell"))) {
      return `Aaj ${snapshot.sales.todayCount} sale hua, ₹${Math.round(snapshot.sales.todayRevenue).toLocaleString("en-IN")} ki revenue aur ₹${Math.round(snapshot.sales.todayProfit).toLocaleString("en-IN")} profit.`;
    }

    // Week sales
    if ((msg.includes("week") || msg.includes("hafta") || msg.includes("saptah")) && (msg.includes("sale") || msg.includes("bikri"))) {
      return `Is week ${snapshot.sales.weekCount} sale hua, ₹${Math.round(snapshot.sales.weekRevenue).toLocaleString("en-IN")} ki revenue.`;
    }

    // Stock value
    if (msg.includes("stock value") || msg.includes("inventory value") || msg.includes("maaldaar")) {
      return `Total stock value ₹${Math.round(snapshot.totals.stockValue).toLocaleString("en-IN")} hai (${snapshot.totals.products} products, ${snapshot.totals.units} units).`;
    }

    // Low stock
    if (msg.includes("low stock") || msg.includes("kam stock") || msg.includes("low")) {
      if (snapshot.totals.lowStock === 0 && snapshot.totals.outOfStock === 0) {
        return `Sab products ki stock achhi hai! Koi low stock nahi hai.`;
      }
      return `${snapshot.totals.lowStock} products low stock par hain (5 ya kam units), ${snapshot.totals.outOfStock} out of stock hain. Jaldi restock karein.`;
    }

    // Out of stock
    if (msg.includes("out of stock") || msg.includes("khatam") || msg.includes("sold out")) {
      return `${snapshot.totals.outOfStock} products out of stock hain. Restock zaroori hai.`;
    }

    // Top sellers
    if (msg.includes("top") || msg.includes("best") || msg.includes("popular") || msg.includes("zayada")) {
      if (snapshot.topSellers.length === 0) {
        return `Abhi sales data nahi hai, isliye top sellers nahi bata sakte.`;
      }
      const top3 = snapshot.topSellers.slice(0, 3);
      return `Top selling products (last 30 days):\n${top3.map((t, i) => `${i + 1}. ${t.name} (${t.brand}) — ${t.qty} units, ₹${Math.round(t.revenue).toLocaleString("en-IN")}`).join("\n")}`;
    }

    // Total products
    if (msg.includes("kitne product") || msg.includes("total product") || msg.includes("sare product")) {
      return `Total ${snapshot.totals.products} products hain, ${snapshot.totals.units} units stock mein, ${snapshot.totals.categories} categories aur ${snapshot.totals.locations} locations mein.`;
    }

    // Product search by name in catalog
    const catalog = await getProductCatalogForAI(200);
    const words = msg.split(/\s+/).filter((w) => w.length > 2);
    const matches = catalog.filter((p) => {
      const haystack = `${p.name} ${p.brand} ${p.bikes} ${p.oem} ${p.category}`.toLowerCase();
      return words.some((w) => haystack.includes(w));
    });

    if (matches.length > 0 && (msg.includes("kahan") || msg.includes("where") || msg.includes("kya") || msg.includes("dhoond") || msg.includes("find") || msg.includes("search"))) {
      const top = matches.slice(0, 3);
      return `Mil gaya:\n${top.map((p) => `• ${p.name} (${p.brand}) — ${p.qty} units, location: ${p.location || "N/A"}, sell: ₹${p.sellingPrice}`).join("\n")}`;
    }

    // Help / default
    return `Main ${snapshot.shopName} ka assistant hoon. Aap puchh sakte hain:\n• "aaj kitne sale hue?"\n• "stock value kya hai?"\n• "low stock parts batao"\n• "top selling products"\n• " Splendor ka brake shoe kahan hai?"\n\nNote: Smart AI ke liye GROQ_API_KEY set karein (free — https://console.groq.com/keys).`;
  } catch (e) {
    return `Sorry, abhi jawab nahi de paaya. "${userMessage}" — dobara try karein.`;
  }
}

// =====================================================================
// PUBLIC: visionChat() — image + text → text
// =====================================================================
export async function visionChat(
  prompt: string,
  imageUrl: string
): Promise<string> {
  if (hasGemini()) return visionChatGemini(prompt, imageUrl);
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return visionChatZAI(zaiCfg, prompt, imageUrl);
  // No vision provider — return a helpful message
  throw new AIConfigError();
}

async function visionChatGemini(prompt: string, imageUrl: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
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
    throw new Error(`Gemini vision failed: ${response.status} ${text.slice(0, 300)}`);
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
  if (hasGemini()) return transcribeGemini(base64Audio);
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg) return transcribeZAI(zaiCfg, base64Audio);
  throw new AIConfigError();
}

async function transcribeGemini(base64Audio: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATED_AI_API_KEY!;
  let mime = "audio/webm";
  let data = base64Audio;
  if (base64Audio.startsWith("data:")) {
    const m = base64Audio.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      mime = m[1];
      data = m[2];
    }
  }

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
    throw new Error(`Gemini ASR failed: ${response.status} ${text.slice(0, 300)}`);
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
// LOCAL SEARCH (no AI needed) — simple keyword + fuzzy matching
// Used when no AI provider is configured, or as a fallback.
// ====================================================================
export function searchProductsLocal(
  query: string,
  catalog: any[]
): { interpretation: string; matches: string[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { interpretation: "Khali query", matches: [] };

  // Tokenize — handle Hindi/English mixed queries
  // Common synonyms mapping
  const synonyms: Record<string, string[]> = {
    brake: ["brake", "brek", "brk"],
    shoe: ["shoe", "shu", "chappal"],
    pad: ["pad", "pads"],
    chain: ["chain", "chen", "zanzir"],
    oil: ["oil", "tel", "lubricant"],
    filter: ["filter", "filtr"],
    plug: ["plug", "plug", "spark"],
    headlight: ["headlight", "head", "light", "halogen"],
    mirror: ["mirror", "darpan", "side"],
    tyre: ["tyre", "tire", "pahiya"],
    tube: ["tube", "tub"],
    clutch: ["clutch", "klach"],
    gear: ["gear", "gir"],
    engine: ["engine", "injan"],
    splendor: ["splendor", "splendre", "splender"],
    hero: ["hero", "hiro"],
    honda: ["honda", "honda"],
    bajaj: ["bajaj", "bajaj"],
    tvs: ["tvs", "tvs"],
    "passion": ["passion", "passion"],
    "hf deluxe": ["hf deluxe", "hf", "deluxe"],
  };

  // Expand query with synonyms
  const queryWords = q.split(/[\s,]+/).filter((w) => w.length > 1);
  const expandedWords = new Set<string>();
  for (const w of queryWords) {
    expandedWords.add(w);
    // Find matching synonyms
    for (const [key, syns] of Object.entries(synonyms)) {
      if (w.includes(key) || syns.some((s) => w.includes(s))) {
        expandedWords.add(key);
        syns.forEach((s) => expandedWords.add(s));
      }
    }
  }

  // Score each product
  const scored = catalog.map((p) => {
    const haystack = `${p.name} ${p.brand} ${p.bikes} ${p.oem} ${p.category}`.toLowerCase();
    let score = 0;
    for (const w of expandedWords) {
      if (haystack.includes(w)) {
        score += w.length > 3 ? 3 : 1; // longer words score more
      }
    }
    // Exact name match bonus
    if (p.name.toLowerCase().includes(q)) score += 10;
    return { id: p.id, score, p };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.id);

  const interpretation = matches.length
    ? `"${query}" ke ${matches.length} matches mil gaye.`
    : `"${query}" ke koi matches nahi mile. Dobara try karein.`;

  return { interpretation, matches };
}

// ====================================================================
// SHOP CONTEXT BUILDERS — with 60-second in-memory cache
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
const SNAPSHOT_TTL_MS = 60_000; // 60 seconds

export async function getShopSnapshot(): Promise<ShopSnapshot> {
  // Return cached if fresh
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

  // Stock value: compute in a single query
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

// Compact product list for AI context — cached for 30s
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
