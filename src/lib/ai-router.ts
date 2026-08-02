// =====================================================================
// ENTERPRISE AI GATEWAY — Smart Router with Multi-Provider Fallback
// ---------------------------------------------------------------------
// Architecture:
//
//   User Query
//      │
//      ▼
//   ┌─────────────────────────────────┐
//   │  Intent Detector                │
//   │  (product/stock/price/sales?)   │
//   └────────┬────────────────────────┘
//            │
//      ┌─────┴─────┐
//      │           │
//   DB query    AI call
//   (instant)     │
//            ┌─────┴──────┐
//            │  Provider  │
//            │  Fallback  │
//            │  Chain     │
//            └────────────┘
//                  │
//         Groq → Gemini → Z.ai → Local
//         (fast)  (vision) (sandbox) (free)
//
// Features:
//   ✅ Smart routing — DB queries skip AI entirely (80-90% less API usage)
//   ✅ Auto fallback — Groq limit hit? → Gemini → Z.ai → Local
//   ✅ Rate limit detection — 429 responses trigger fallback
//   ✅ Usage tracking — in-memory stats per provider
//   ✅ Circuit breaker — failed providers get temporary cooldown
// =====================================================================

import { db } from "./db";

// =====================================================================
// Provider configuration
// =====================================================================

export type ProviderName = "openrouter" | "groq" | "gemini" | "zai" | "local";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const OPENROUTER_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_VISION_MODEL_FALLBACK = "llama-3.2-90b-vision-preview";

const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TEXT_MODEL = "gemini-flash-latest";
const GEMINI_VISION_MODEL = "gemini-flash-latest";

// =====================================================================
// Usage tracking (in-memory, resets on server restart)
// =====================================================================

export type ProviderStats = {
  name: ProviderName;
  requests: number;
  successes: number;
  failures: number;
  rateLimited: number;
  lastUsed: number | null;
  lastError: string | null;
  avgLatencyMs: number;
  // circuit breaker
  cooldownUntil: number | null;
};

const _stats: Record<ProviderName, ProviderStats> = {
  openrouter: { name: "openrouter", requests: 0, successes: 0, failures: 0, rateLimited: 0, lastUsed: null, lastError: null, avgLatencyMs: 0, cooldownUntil: null },
  groq: { name: "groq", requests: 0, successes: 0, failures: 0, rateLimited: 0, lastUsed: null, lastError: null, avgLatencyMs: 0, cooldownUntil: null },
  gemini: { name: "gemini", requests: 0, successes: 0, failures: 0, rateLimited: 0, lastUsed: null, lastError: null, avgLatencyMs: 0, cooldownUntil: null },
  zai: { name: "zai", requests: 0, successes: 0, failures: 0, rateLimited: 0, lastUsed: null, lastError: null, avgLatencyMs: 0, cooldownUntil: null },
  local: { name: "local", requests: 0, successes: 0, failures: 0, rateLimited: 0, lastUsed: null, lastError: null, avgLatencyMs: 0, cooldownUntil: null },
};

export function getUsageStats() {
  const now = Date.now();
  return {
    generatedAt: new Date().toISOString(),
    providers: Object.values(_stats).map((s) => ({
      ...s,
      available: isProviderAvailable(s.name),
      cooldownRemainingMs: s.cooldownUntil && s.cooldownUntil > now ? s.cooldownUntil - now : 0,
    })),
    totals: {
      requests: Object.values(_stats).reduce((a, s) => a + s.requests, 0),
      successes: Object.values(_stats).reduce((a, s) => a + s.successes, 0),
      failures: Object.values(_stats).reduce((a, s) => a + s.failures, 0),
    },
  };
}

function recordSuccess(provider: ProviderName, latencyMs: number) {
  const s = _stats[provider];
  s.requests++;
  s.successes++;
  s.lastUsed = Date.now();
  s.lastError = null;
  // rolling average
  s.avgLatencyMs = s.avgLatencyMs === 0 ? latencyMs : Math.round((s.avgLatencyMs * 0.7) + (latencyMs * 0.3));
}

function recordFailure(provider: ProviderName, error: string, rateLimited = false) {
  const s = _stats[provider];
  s.requests++;
  s.failures++;
  s.lastUsed = Date.now();
  s.lastError = error.slice(0, 200);
  if (rateLimited) {
    s.rateLimited++;
    // 60s cooldown for rate-limited providers
    s.cooldownUntil = Date.now() + 60_000;
  } else if (s.failures % 3 === 0) {
    // after 3 consecutive failures, cooldown 30s
    s.cooldownUntil = Date.now() + 30_000;
  }
}

function isProviderAvailable(provider: ProviderName): boolean {
  const s = _stats[provider];
  if (s.cooldownUntil && s.cooldownUntil > Date.now()) return false;
  switch (provider) {
    case "openrouter":
      return !!process.env.OPENROUTER_API_KEY;
    case "groq":
      return !!process.env.GROQ_API_KEY;
    case "gemini":
      return !!process.env.GOOGLE_GENERATED_AI_API_KEY;
    case "zai":
      return true; // will check lazily
    case "local":
      return true; // always
  }
}

// =====================================================================
// ZAI config (lazy-loaded, sandbox only)
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

  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(os.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];

  for (const p of configPaths) {
    try {
      const content = await fs.promises.readFile(p, "utf-8");
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
      // file doesn't exist — continue
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

export async function hasAIProvider(): Promise<boolean> {
  if (isProviderAvailable("openrouter")) return true;
  if (isProviderAvailable("groq")) return true;
  if (isProviderAvailable("gemini")) return true;
  const zai = await loadZAIConfig();
  return !!zai;
}

// =====================================================================
// INTENT DETECTION — Smart routing
// ---------------------------------------------------------------------
// Detects if a user query can be answered directly from the database
// WITHOUT calling any AI. This reduces API usage by 80-90%.
// =====================================================================

export type QueryIntent =
  | { type: "db"; subtype: "product_search" | "stock_check" | "price_check" | "location_check" | "out_of_stock" | "low_stock" | "sales_today" | "sales_week" | "stock_value" | "top_sellers" | "total_products" | "greeting" | "help"; query?: string }
  | { type: "ai"; reason: string };

const DB_KEYWORDS = {
  product_search: ["kahan", "where", "dhoond", "find", "search", "chalta", "lagta", "hai?", "hai ", "chahiye", "lana", "lakar"],
  stock_check: ["stock", "kitna", "kitne", "quantity", "maatra", "pada", "bacha", "kitni"],
  price_check: ["price", "daam", "rate", "kitne ka", "cost", "paisa", "kimat", "mulya"],
  location_check: ["kahan rakha", "rack", "shelf", "location", "kahan hai", "counter", "dibba"],
  out_of_stock: ["out of stock", "khatam", "sold out", "nahi hai", "missing", "empty"],
  low_stock: ["low stock", "kam stock", "kam pad", "low"],
  sales_today: ["aaj", "today"],
  sales_week: ["week", "hafta", "saptah", "7 din"],
  stock_value: ["stock value", "inventory value", "total value", "maaldaar", "kitne ka maal"],
  top_sellers: ["top", "best", "popular", "zayada", "sabse", "fast selling"],
  total_products: ["total product", "kitne product", "sare product", "sabhi product"],
  greeting: ["hi", "hello", "hey", "namaste", "salaam", "assalam", "ram ram"],
  help: ["help", "madad", "kya kar", "kaise", "kya kya"],
};

const SALES_KEYWORDS = ["sale", "bikri", "bikra", "sell", "aaye", "income", "revenue", "kamai"];

export function detectIntent(message: string): QueryIntent {
  const msg = message.toLowerCase().trim();

  // Greeting
  if (/^(hi|hello|hey|namaste|salaam|assalam|ram ram)\b/.test(msg) && msg.length < 30) {
    return { type: "db", subtype: "greeting" };
  }

  // Help
  if (msg === "help" || msg.includes("kya kar sakte") || msg.includes("madad") && msg.length < 30) {
    return { type: "db", subtype: "help" };
  }

  // Sales today
  if (DB_KEYWORDS.sales_today.some((k) => msg.includes(k)) && SALES_KEYWORDS.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "sales_today" };
  }

  // Sales week
  if (DB_KEYWORDS.sales_week.some((k) => msg.includes(k)) && SALES_KEYWORDS.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "sales_week" };
  }

  // Stock value
  if (DB_KEYWORDS.stock_value.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "stock_value" };
  }

  // Out of stock
  if (DB_KEYWORDS.out_of_stock.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "out_of_stock" };
  }

  // Low stock
  if (DB_KEYWORDS.low_stock.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "low_stock" };
  }

  // Top sellers
  if (DB_KEYWORDS.top_sellers.some((k) => msg.includes(k)) && SALES_KEYWORDS.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "top_sellers" };
  }

  // Total products
  if (DB_KEYWORDS.total_products.some((k) => msg.includes(k))) {
    return { type: "db", subtype: "total_products" };
  }

  // Product search (most common) — check for part names/bike models
  const partKeywords = ["brake", "clutch", "chain", "filter", "oil", "plug", "spark", "tyre", "tire", "tube", "mirror", "light", "headlight", "cable", "gear", "bearing", "piston", "ring", "engine", "shoe", "pad", "lever", "horn", "coil", "inductor", "spray", "holder", "kit"];
  const bikeKeywords = ["splendor", "passion", "pulsar", "apache", "honda", "hero", "bajaj", "tvs", "deluxe", "hf", "rtr", "cd", "discovery", "hunk", "cbz", "extor"];

  const hasPartKeyword = partKeywords.some((k) => msg.includes(k));
  const hasBikeKeyword = bikeKeywords.some((k) => msg.includes(k));
  const hasSearchKeyword = DB_KEYWORDS.product_search.some((k) => msg.includes(k));

  if ((hasPartKeyword || hasBikeKeyword) && (hasSearchKeyword || msg.includes("hai") || msg.includes("?"))) {
    return { type: "db", subtype: "product_search", query: message };
  }

  // Stock check (without being a search)
  if (DB_KEYWORDS.stock_check.some((k) => msg.includes(k)) && hasPartKeyword) {
    return { type: "db", subtype: "stock_check", query: message };
  }

  // Price check
  if (DB_KEYWORDS.price_check.some((k) => msg.includes(k)) && hasPartKeyword) {
    return { type: "db", subtype: "price_check", query: message };
  }

  // Location check
  if (DB_KEYWORDS.location_check.some((k) => msg.includes(k)) && hasPartKeyword) {
    return { type: "db", subtype: "location_check", query: message };
  }

  // Default: use AI
  return { type: "ai", reason: "complex query — needs AI reasoning" };
}

// =====================================================================
// DB RESOLVER — answers common queries directly from the database
// =====================================================================

export async function resolveFromDB(
  intent: { type: "db"; subtype: string; query?: string },
  shopSnapshot: any
): Promise<string | null> {
  const formatINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

  switch (intent.subtype) {
    case "greeting":
      return `Namaste! Main ShopMitra hoon, ${shopSnapshot.shopName} ka AI saathi. Aap puchh sakte hain:\n• "aaj kitne sale hue?"\n• "stock value kya hai?"\n• "low stock parts batao"\n• "top selling products"\n• "Splendor ka brake shoe kahan hai?"`;

    case "help":
      return `Main ${shopSnapshot.shopName} ka assistant hoon. Yeh puchh sakte hain:\n• Sales: "aaj/week kitne sale hue?"\n• Stock: "stock value?", "low stock", "out of stock"\n• Products: "Splendor ka brake shoe kahan hai?", "total kitne products?"\n• Top sellers: "top selling products"\n• Prices: "brake shoe ka price?"`;

    case "sales_today":
      return `Aaj ${shopSnapshot.sales.todayCount} sale hua, ${formatINR(shopSnapshot.sales.todayRevenue)} revenue aur ${formatINR(shopSnapshot.sales.todayProfit)} profit.`;

    case "sales_week":
      return `Is week ${shopSnapshot.sales.weekCount} sale hua, ${formatINR(shopSnapshot.sales.weekRevenue)} revenue.`;

    case "stock_value":
      return `Total stock value ${formatINR(shopSnapshot.totals.stockValue)} hai (${shopSnapshot.totals.products} products, ${shopSnapshot.totals.units} units).`;

    case "out_of_stock":
      if (shopSnapshot.totals.outOfStock === 0) {
        return `Sab products ki stock achhi hai! Koi out of stock nahi hai.`;
      }
      return `${shopSnapshot.totals.outOfStock} products out of stock hain. Restock zaroori hai.`;

    case "low_stock":
      if (shopSnapshot.totals.lowStock === 0 && shopSnapshot.totals.outOfStock === 0) {
        return `Sab products ki stock achhi hai! Koi low stock nahi hai.`;
      }
      return `${shopSnapshot.totals.lowStock} products low stock par hain (5 ya kam units), ${shopSnapshot.totals.outOfStock} out of stock hain. Jaldi restock karein.`;

    case "top_sellers":
      if (shopSnapshot.topSellers.length === 0) {
        return `Abhi sales data nahi hai, isliye top sellers nahi bata sakte.`;
      }
      const top3 = shopSnapshot.topSellers.slice(0, 5);
      return `Top selling products (last 30 days):\n${top3.map((t: any, i: number) => `${i + 1}. ${t.name} (${t.brand}) — ${t.qty} units, ${formatINR(t.revenue)}`).join("\n")}`;

    case "total_products":
      return `Total ${shopSnapshot.totals.products} products hain, ${shopSnapshot.totals.units} units stock mein, ${shopSnapshot.totals.categories} categories aur ${shopSnapshot.totals.locations} locations mein.`;

    case "product_search":
    case "stock_check":
    case "price_check":
    case "location_check": {
      // Search the product catalog
      if (!intent.query) return null;
      let products: any[];
      try {
        products = await db.product.findMany({
          take: 100,
          include: {
            category: { select: { name: true } },
            location: { select: { code: true } },
          },
        });
      } catch (dbErr) {
        // DB unavailable — can't search products
        console.warn("resolveFromDB: product search DB unavailable.", (dbErr as Error)?.message?.slice(0, 80));
        return null;
      }

      const q = intent.query.toLowerCase();
      const words = q.split(/[\s,?]+/).filter((w) => w.length > 2);
      const scored = products.map((p) => {
        const haystack = `${p.name} ${p.brand} ${p.bikeModels} ${p.oemNumber} ${p.category?.name}`.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (haystack.includes(w)) score += w.length > 3 ? 3 : 1;
        }
        return { p, score };
      });
      const matches = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (matches.length === 0) return null;

      const top = matches[0].p;
      const others = matches.slice(1).map((m) => m.p);

      if (intent.subtype === "price_check") {
        const lines = [`**${top.name}** (${top.brand})`];
        lines.push(`Purchase: ${formatINR(top.purchasePrice)} | Selling: ${formatINR(top.sellingPrice)} | Stock: ${top.quantity} units`);
        if (others.length > 0) {
          lines.push(`\nAur options:`);
          others.forEach((p) => lines.push(`• ${p.name} (${p.brand}) — ${formatINR(p.sellingPrice)}, ${p.quantity} units`));
        }
        return lines.join("\n");
      }

      if (intent.subtype === "location_check") {
        return `**${top.name}** (${top.brand}) — Rack ${top.location?.code || "N/A"} par rakha hai. Stock: ${top.quantity} units.`;
      }

      if (intent.subtype === "stock_check") {
        const status = top.quantity === 0 ? "❌ OUT OF STOCK" : top.quantity <= top.minStock ? `⚠️ LOW STOCK (min ${top.minStock})` : "✅ In Stock";
        return `**${top.name}** (${top.brand}) — ${top.quantity} units. ${status}${top.location ? ` | Location: ${top.location.code}` : ""}`;
      }

      // product_search — full info
      const lines = [`Mil gaya: **${top.name}**`];
      lines.push(`Brand: ${top.brand || "N/A"} | OEM: ${top.oemNumber || "N/A"}`);
      lines.push(`Bikes: ${top.bikeModels || "Universal"} | Category: ${top.category?.name || "N/A"}`);
      lines.push(`Stock: ${top.quantity} units | Price: ${formatINR(top.sellingPrice)} | Location: ${top.location?.code || "N/A"}`);
      if (others.length > 0) {
        lines.push(`\nAur similar parts:`);
        others.forEach((p) => lines.push(`• ${p.name} (${p.brand}) — ${p.quantity} units, ${formatINR(p.sellingPrice)}`));
      }
      return lines.join("\n");
    }

    default:
      return null;
  }
}

// =====================================================================
// PROVIDER CHAT FUNCTIONS
// =====================================================================

async function chatOpenRouter(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const messages = [
    { role: "system", content: systemPrompt },
    ...(opts?.history || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const t0 = Date.now();
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://bike-shop.vercel.app",
      "X-Title": "Bike Parts Shop OS",
    },
    body: JSON.stringify({
      model: OPENROUTER_TEXT_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const rateLimited = response.status === 429;
    recordFailure("openrouter", `OpenRouter ${response.status}: ${text.slice(0, 100)}`, rateLimited);
    throw new Error(`OpenRouter failed: ${response.status} ${rateLimited ? "(rate limited)" : text.slice(0, 100)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  recordSuccess("openrouter", Date.now() - t0);
  return content;
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

  const t0 = Date.now();
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
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const rateLimited = response.status === 429;
    recordFailure("groq", `Groq ${response.status}: ${text.slice(0, 100)}`, rateLimited);
    throw new Error(`Groq failed: ${response.status} ${rateLimited ? "(rate limited)" : text.slice(0, 100)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  recordSuccess("groq", Date.now() - t0);
  return content;
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

  const t0 = Date.now();
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
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const rateLimited = response.status === 429;
    recordFailure("gemini", `Gemini ${response.status}: ${text.slice(0, 100)}`, rateLimited);
    throw new Error(`Gemini failed: ${response.status} ${rateLimited ? "(rate limited)" : text.slice(0, 100)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  recordSuccess("gemini", Date.now() - t0);
  return content;
}

async function chatZAI(
  systemPrompt: string,
  userMessage: string,
  opts?: { history?: { role: string; content: string }[] }
): Promise<string> {
  const cfg = await loadZAIConfig();
  if (!cfg) throw new Error("ZAI not configured");

  const messages = [
    { role: "assistant", content: systemPrompt },
    ...(opts?.history || []),
    { role: "user", content: userMessage },
  ];

  const t0 = Date.now();
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
    const rateLimited = response.status === 429;
    recordFailure("zai", `ZAI ${response.status}: ${text.slice(0, 100)}`, rateLimited);
    throw new Error(`ZAI failed: ${response.status} ${text.slice(0, 100)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  recordSuccess("zai", Date.now() - t0);
  return content;
}

// Local fallback — no API needed
async function chatLocal(
  systemPrompt: string,
  userMessage: string,
  shopSnapshot: any
): Promise<string> {
  const t0 = Date.now();
  // Try DB resolution first
  const intent = detectIntent(userMessage);
  if (intent.type === "db") {
    const reply = await resolveFromDB(intent, shopSnapshot);
    if (reply) {
      recordSuccess("local", Date.now() - t0);
      return reply;
    }
  }

  // Generic fallback
  const msg = userMessage.toLowerCase();
  if (msg.includes("recommend") || msg.includes("suggest")) {
    const reply = `Main ${shopSnapshot.shopName} ka basic assistant hoon. Smart AI (Groq/Gemini) configure karein better recommendations ke liye. Abhi ${shopSnapshot.totals.lowStock} products low stock par hain — unhe restock karein.`;
    recordSuccess("local", Date.now() - t0);
    return reply;
  }

  const reply = `Main ${shopSnapshot.shopName} ka assistant hoon. "${userMessage}" — iska answer ke liye AI provider (Groq/Gemini) zaroori hai. Free key: https://console.groq.com/keys\n\nAap simple sawal puchh sakte hain:\n• "aaj kitne sale hue?"\n• "stock value kya hai?"\n• "low stock parts batao"`;
  recordSuccess("local", Date.now() - t0);
  return reply;
}

// =====================================================================
// SMART CHAT — main entry point
// ---------------------------------------------------------------------
// 1. Detect intent → if DB query, answer instantly (no AI call)
// 2. If AI needed → try providers in order: Groq → Gemini → Z.ai → Local
// 3. Auto-fallback on rate limits (429) and errors
// =====================================================================

export type SmartChatResult = {
  reply: string;
  provider: ProviderName;
  intent: QueryIntent;
  fromCache: boolean;
};

export async function smartChat(
  systemPrompt: string,
  userMessage: string,
  opts?: {
    history?: { role: string; content: string }[];
    shopSnapshot?: any;
    skipDB?: boolean; // force AI even for DB-able queries
  }
): Promise<SmartChatResult> {
  const snapshot = opts?.shopSnapshot;

  // STEP 1: Try DB resolution first (instant, free, no API call)
  if (!opts?.skipDB && snapshot) {
    const intent = detectIntent(userMessage);
    if (intent.type === "db") {
      try {
        const reply = await resolveFromDB(intent, snapshot);
        if (reply) {
          return { reply, provider: "local", intent, fromCache: false };
        }
      } catch (dbErr) {
        // DB resolution failed — fall through to AI providers
        console.warn("[ai-router] DB resolution failed, falling through to AI:", (dbErr as Error)?.message?.slice(0, 80));
      }
    }
  }

  // STEP 2: AI provider fallback chain
  const intent: QueryIntent = { type: "ai", reason: "complex query" };
  const providers: ProviderName[] = ["openrouter", "groq", "gemini", "zai", "local"];

  for (const provider of providers) {
    if (!isProviderAvailable(provider)) continue;

    try {
      let reply: string;
      if (provider === "openrouter") {
        reply = await chatOpenRouter(systemPrompt, userMessage, opts);
      } else if (provider === "groq") {
        reply = await chatGroq(systemPrompt, userMessage, opts);
      } else if (provider === "gemini") {
        reply = await chatGemini(systemPrompt, userMessage, opts);
      } else if (provider === "zai") {
        reply = await chatZAI(systemPrompt, userMessage, opts);
      } else {
        reply = await chatLocal(systemPrompt, userMessage, snapshot || {});
      }
      return { reply, provider, intent, fromCache: false };
    } catch (e) {
      // Provider failed — try next one
      console.error(`[ai-router] ${provider} failed:`, (e as Error).message);
      continue;
    }
  }

  // STEP 3: Ultimate fallback — local
  const reply = await chatLocal(systemPrompt, userMessage, snapshot || {});
  return { reply, provider: "local", intent, fromCache: false };
}

// =====================================================================
// VISION CHAT — image + text (Gemini or Z.ai only)
// =====================================================================

export async function smartVisionChat(
  prompt: string,
  imageUrl: string
): Promise<{ result: string; provider: ProviderName }> {
  // Try OpenRouter first (works globally, free vision models, no geo-block)
  if (isProviderAvailable("openrouter")) {
    try {
      const t0 = Date.now();
      const apiKey = process.env.OPENROUTER_API_KEY!;
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://bike-shop.vercel.app",
          "X-Title": "Bike Parts Shop OS",
        },
        body: JSON.stringify({
          model: OPENROUTER_VISION_MODEL,
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
          max_tokens: 1024,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        recordSuccess("openrouter", Date.now() - t0);
        return { result: content, provider: "openrouter" };
      } else {
        const text = await response.text().catch(() => "");
        const rateLimited = response.status === 429;
        recordFailure("openrouter", `Vision ${response.status}: ${text.slice(0, 100)}`, rateLimited);
      }
    } catch (e) {
      console.error("[ai-router] OpenRouter vision failed:", (e as Error).message);
    }
  }

  // Try Groq (free, has vision models — try multiple model names for compat)
  if (isProviderAvailable("groq")) {
    const groqVisionModels = [GROQ_VISION_MODEL, GROQ_VISION_MODEL_FALLBACK];
    for (const modelName of groqVisionModels) {
      try {
        const t0 = Date.now();
        const apiKey = process.env.GROQ_API_KEY!;
        const response = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
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
            max_tokens: 1024,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          recordSuccess("groq", Date.now() - t0);
          return { result: content, provider: "groq" };
        } else if (response.status === 404) {
          // Model not found — try next model name
          continue;
        } else {
          const text = await response.text().catch(() => "");
          const rateLimited = response.status === 429;
          recordFailure("groq", `Vision ${response.status}: ${text.slice(0, 100)}`, rateLimited);
          break; // non-404 error, don't try other models
        }
      } catch (e) {
        console.error(`[ai-router] Groq vision (${modelName}) failed:`, (e as Error).message);
      }
    }
  }

  // Try Gemini (best vision)
  if (isProviderAvailable("gemini")) {
    try {
      const t0 = Date.now();
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

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        recordSuccess("gemini", Date.now() - t0);
        return { result: content, provider: "gemini" };
      } else {
        const text = await response.text().catch(() => "");
        const rateLimited = response.status === 429;
        recordFailure("gemini", `Vision ${response.status}: ${text.slice(0, 100)}`, rateLimited);
      }
    } catch (e) {
      console.error("[ai-router] Gemini vision failed:", (e as Error).message);
    }
  }

  // Try Z.ai
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg && isProviderAvailable("zai")) {
    try {
      const t0 = Date.now();
      const response = await fetch(`${zaiCfg.baseUrl}/chat/completions/vision`, {
        method: "POST",
        headers: buildZAIHeaders(zaiCfg),
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

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";
        recordSuccess("zai", Date.now() - t0);
        return { result: content, provider: "zai" };
      } else {
        const text = await response.text().catch(() => "");
        recordFailure("zai", `Vision ${response.status}: ${text.slice(0, 100)}`, response.status === 429);
      }
    } catch (e) {
      console.error("[ai-router] ZAI vision failed:", (e as Error).message);
    }
  }

  throw new Error("No vision AI provider available. Set OPENROUTER_API_KEY (free, recommended — openrouter.ai/keys, works in India) or GROQ_API_KEY or GOOGLE_GENERATED_AI_API_KEY for photo scan/OCR.");
}

// =====================================================================
// TRANSCRIBE — audio → text (Gemini or Z.ai only)
// =====================================================================

export async function smartTranscribe(
  base64Audio: string
): Promise<{ transcript: string; provider: ProviderName }> {
  // Groq Whisper (fast, free, works globally)
  if (isProviderAvailable("groq")) {
    try {
      const t0 = Date.now();
      const apiKey = process.env.GROQ_API_KEY!;
      // Groq Whisper needs the raw audio data (not data URL)
      let audioData = base64Audio;
      let mime = "audio/webm";
      if (base64Audio.startsWith("data:")) {
        const m = base64Audio.match(/^data:([^;]+);base64,(.+)$/);
        if (m) { mime = m[1]; audioData = m[2]; }
      }
      const audioBlob = Buffer.from(audioData, "base64");
      const ext = mime.includes("webm") ? "webm" : mime.includes("mp3") ? "mp3" : "wav";

      const formData = new FormData();
      formData.append("file", new Blob([audioBlob], { type: mime }), `audio.${ext}`);
      formData.append("model", "whisper-large-v3");
      formData.append("language", "hi");

      const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        recordSuccess("groq", Date.now() - t0);
        return { transcript: data.text || "", provider: "groq" };
      } else {
        const text = await response.text().catch(() => "");
        recordFailure("groq", `ASR ${response.status}: ${text.slice(0, 100)}`, response.status === 429);
      }
    } catch (e) {
      console.error("[ai-router] Groq ASR failed:", (e as Error).message);
    }
  }

  // Gemini
  if (isProviderAvailable("gemini")) {
    try {
      const t0 = Date.now();
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
                  { text: "Transcribe this audio exactly. Reply ONLY with the text." },
                  { inline_data: { mime_type: mime, data } },
                ],
              },
            ],
            generationConfig: { temperature: 0 },
          }),
        }
      );

      if (response.ok) {
        const data2 = await response.json();
        const parts = data2.candidates?.[0]?.content?.parts || [];
        const transcript = parts.map((p: any) => p?.text || "").join("").trim();
        recordSuccess("gemini", Date.now() - t0);
        return { transcript, provider: "gemini" };
      } else {
        const text = await response.text().catch(() => "");
        recordFailure("gemini", `ASR ${response.status}: ${text.slice(0, 100)}`, response.status === 429);
      }
    } catch (e) {
      console.error("[ai-router] Gemini ASR failed:", (e as Error).message);
    }
  }

  // Z.ai
  const zaiCfg = await loadZAIConfig();
  if (zaiCfg && isProviderAvailable("zai")) {
    try {
      const t0 = Date.now();
      const response = await fetch(`${zaiCfg.baseUrl}/audio/asr`, {
        method: "POST",
        headers: buildZAIHeaders(zaiCfg),
        body: JSON.stringify({ file_base64: base64Audio }),
      });

      if (response.ok) {
        const data = await response.json();
        recordSuccess("zai", Date.now() - t0);
        return { transcript: data.text || "", provider: "zai" };
      } else {
        const text = await response.text().catch(() => "");
        recordFailure("zai", `ASR ${response.status}: ${text.slice(0, 100)}`, response.status === 429);
      }
    } catch (e) {
      console.error("[ai-router] ZAI ASR failed:", (e as Error).message);
    }
  }

  throw new Error("No transcription provider available. Set GROQ_API_KEY (whisper, free) or OPENROUTER_API_KEY or GOOGLE_GENERATED_AI_API_KEY for voice search.");
}

// =====================================================================
// SEARCH PRODUCTS LOCAL — keyword matching with synonyms (no AI needed)
// =====================================================================

export function searchProductsLocal(
  query: string,
  catalog: any[]
): { interpretation: string; matches: string[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { interpretation: "Khali query", matches: [] };

  const synonyms: Record<string, string[]> = {
    brake: ["brake", "brek", "brk"],
    shoe: ["shoe", "shu"],
    chain: ["chain", "chen", "zanzir"],
    oil: ["oil", "tel"],
    filter: ["filter", "filtr"],
    plug: ["plug", "spark"],
    headlight: ["headlight", "head", "light"],
    mirror: ["mirror", "darpan", "side"],
    tyre: ["tyre", "tire", "pahiya"],
    tube: ["tube", "tub"],
    clutch: ["clutch", "klach"],
    splendor: ["splendor", "splendre", "splender"],
    hero: ["hero", "hiro"],
  };

  const queryWords = q.split(/[\s,]+/).filter((w) => w.length > 1);
  const expandedWords = new Set<string>();
  for (const w of queryWords) {
    expandedWords.add(w);
    for (const [key, syns] of Object.entries(synonyms)) {
      if (w.includes(key) || syns.some((s) => w.includes(s))) {
        expandedWords.add(key);
        syns.forEach((s) => expandedWords.add(s));
      }
    }
  }

  const scored = catalog.map((p) => {
    const haystack = `${p.name} ${p.brand} ${p.bikes} ${p.oem} ${p.category}`.toLowerCase();
    let score = 0;
    for (const w of expandedWords) {
      if (haystack.includes(w)) score += w.length > 3 ? 3 : 1;
    }
    if (p.name.toLowerCase().includes(q)) score += 10;
    return { id: p.id, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.id);

  const interpretation = matches.length
    ? `"${query}" ke ${matches.length} matches mil gaye.`
    : `"${query}" ke koi matches nahi mile.`;

  return { interpretation, matches };
}
