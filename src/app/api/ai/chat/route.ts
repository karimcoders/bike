import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import {
  chatWithMeta,
  getShopSnapshot,
  getProductCatalogForAI,
  aiErrorMessage,
} from "@/lib/ai";
import {
  chatOpenRouterWithTools,
  isProviderAvailable,
  type ChatMessage,
  type ToolDef,
} from "@/lib/ai-router";

// POST /api/ai/chat — AI Shop Assistant (Hinglish, shop-aware)
// Smart routing: DB-able queries (stock, price, sales) skip AI entirely.
// AI queries fall back: OpenRouter → Groq → Gemini → Z.ai → Local.
// NEW: when the user asks to ADD a product, the AI calls the `create_product`
// tool and the product is inserted into the inventory automatically.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { message, history } = await req.json();
    if (!message) return err("Message required");

    // Detect "add product" intent EARLY so we can skip the heavy
    // snapshot+catalog DB queries (which are only needed for Q&A).
    const addIntent = /\b(add|jod|jodo|daal|daalo|naya|new|create|insert|add karo|add kar|jama karo)\b/i.test(message)
      && /\b(product|part|piece|maal|stock|inventory|spare|brake|clutch|chain|pad|plate|filter|cable|tyre|tube|engine|gear|bore|kit|set)\b/i.test(message);

    // For add-product intent, load only minimal context (shop name) — skip
    // the full 100-product catalog and sales snapshot. This makes the add
    // flow 5-10x faster.
    let snapshot: any;
    let catalog: any[];
    if (addIntent) {
      snapshot = {
        shopName: "Bike Shop",
        ownerName: "Owner",
        totals: { products: 0, units: 0, outOfStock: 0, lowStock: 0, stockValue: 0, categories: 0, locations: 0 },
        sales: { todayCount: 0, todayRevenue: 0, todayProfit: 0, weekCount: 0, weekRevenue: 0 },
        topSellers: [],
        recentSales: [],
      };
      try {
        const s = await db.settings.findUnique({ where: { id: "singleton" } });
        if (s) { snapshot.shopName = s.shopName || "Bike Shop"; snapshot.ownerName = s.ownerName || "Owner"; }
      } catch { /* ignore */ }
      catalog = [];
    } else {
      [snapshot, catalog] = await Promise.all([
        getShopSnapshot(),
        getProductCatalogForAI(100),
      ]);
    }

    const systemPrompt = `You are "ShopMitra" — an AI assistant for a bike spare-parts shop in rural Bihar (shop name: ${snapshot.shopName}, owner: ${snapshot.ownerName}).

You speak in friendly Hinglish (Hindi + English mix) like a helpful shop helper. Keep replies SHORT and practical (2-5 lines usually). Use simple words — the owner is not technical.

You have LIVE access to the shop's inventory. Here is the current snapshot:
- Total products: ${snapshot.totals.products} (${snapshot.totals.units} units in stock)
- Out of stock: ${snapshot.totals.outOfStock}, Low stock: ${snapshot.totals.lowStock}
- Stock value: ₹${Math.round(snapshot.totals.stockValue).toLocaleString("en-IN")}
- Today: ${snapshot.sales.todayCount} sales, ₹${Math.round(snapshot.sales.todayRevenue).toLocaleString("en-IN")} revenue, ₹${Math.round(snapshot.sales.todayProfit).toLocaleString("en-IN")} profit
- This week: ${snapshot.sales.weekCount} sales, ₹${Math.round(snapshot.sales.weekRevenue).toLocaleString("en-IN")} revenue

Top selling products (last 30 days):
${snapshot.topSellers.map((t) => `- ${t.name} (${t.brand}): ${t.qty} units, ₹${Math.round(t.revenue).toLocaleString("en-IN")}`).join("\n") || "- No sales data yet"}

Product catalog (name | brand | OEM | bikes | category | location | qty | minStock | sellPrice | purchasePrice | supplier):
${catalog.map((p) => `- ${p.name} | ${p.brand} | ${p.oem} | ${p.bikes} | ${p.category} | ${p.location} | qty:${p.qty} | min:${p.minStock} | sell:₹${p.sellingPrice} | buy:₹${p.purchasePrice} | ${p.supplier}${p.lastSoldAt ? ` | last sold: ${new Date(p.lastSoldAt).toLocaleDateString("en-IN")}` : " | never sold"}`).join("\n")}

Rules:
- When asked about a part, find it in the catalog and mention its NAME, LOCATION (rack-row-box), and STOCK.
- When asked "how much stock", give exact numbers from the catalog.
- When asked about sales/profit, use the snapshot numbers.
- Suggest restocking for low/out-of-stock items when relevant.
- If the user asks in Bhojpuri or Hindi, reply in the same style.
- Never invent products. Only use the catalog above. If not found, say so honestly.
- For recommendations, suggest related parts from the catalog.

IMPORTANT — ADDING PRODUCTS:
- When the user wants to ADD / JOD / DAAL / "naya product" a new product to inventory, you MUST call the \`create_product\` tool. Do not just describe the steps — actually call the tool so the product gets added.
- Extract the fields from the user's message. If a field is missing (e.g. price or quantity), make a reasonable guess for a rural Bihar bike-parts shop and proceed — do NOT ask for clarification unless the product name itself is unclear.
- After the tool returns success, confirm to the user in 1-2 Hinglish lines: product name, qty, price, and the location box it was placed in.
- If the user wants to add MULTIPLE products, call the tool once per product.`;

    // ---- Detect "add product" intent → tool-calling path ----
    const openrouterAvailable = await isProviderAvailable("openrouter");

    if (addIntent && openrouterAvailable) {
      // Tool-calling loop (max 6 rounds to allow multiple products)
      const tools: ToolDef[] = [
        {
          type: "function",
          function: {
            name: "create_product",
            description:
              "Add a NEW product to the shop inventory. Call this when the user asks to add/jod/daal a product. Returns the created product with its assigned location box.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Product name, e.g. 'Clutch Plate' or 'Brake Pad Set'" },
                brand: { type: "string", description: "Brand / manufacturer, e.g. Bajaj, Honda, Brembo, Bosch" },
                bikeModels: { type: "string", description: "Compatible bike models, e.g. 'Pulsar 150, Splendor, HF Deluxe'. Use 'Universal' if generic." },
                category: { type: "string", description: "Category name: Brake, Clutch, Engine, Electrical, Transmission, Frame, Suspension, Tyre, Exhaust, Fuel, Universal" },
                purchasePrice: { type: "number", description: "Purchase / cost price in INR (whole number)" },
                sellingPrice: { type: "number", description: "Selling price in INR (whole number)" },
                quantity: { type: "number", description: "Number of units to add to stock" },
                minStock: { type: "number", description: "Minimum stock level for low-stock alerts (e.g. 5)" },
                supplier: { type: "string", description: "Supplier / distributor name" },
                oemNumber: { type: "string", description: "OEM part number if known, else empty" },
              },
              required: ["name", "brand", "category", "sellingPrice", "quantity"],
            },
          },
        },
      ];

      const histMsgs: ChatMessage[] = (history || []).slice(-8).map((m: any) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as ChatMessage["role"],
        content: m.content,
      }));

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...histMsgs,
        { role: "user", content: message },
      ];

      const createdProducts: string[] = [];
      let finalReply = "";
      const MAX_ROUNDS = 6;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await chatOpenRouterWithTools(messages, tools);

        if (!res.tool_calls || res.tool_calls.length === 0) {
          // No more tool calls — this is the final natural-language reply
          finalReply = res.content || "Ho gaya!";
          break;
        }

        // Push the assistant message (with tool_calls) onto the conversation
        messages.push({
          role: "assistant",
          content: res.content,
          tool_calls: res.tool_calls,
        });

        // Execute each tool call
        for (const tc of res.tool_calls) {
          let toolResult: string;
          if (tc.function.name === "create_product") {
            try {
              let args: any = {};
              try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
              const created = await executeCreateProduct(args, user.id);
              createdProducts.push(
                `${created.name} (${created.brand || "no brand"}) — qty ${created.quantity}, ₹${created.sellingPrice}, box ${created.locationCode || "auto"}`
              );
              toolResult = JSON.stringify({
                success: true,
                product: {
                  id: created.id,
                  name: created.name,
                  brand: created.brand,
                  category: created.category,
                  location: created.locationCode,
                  quantity: created.quantity,
                  sellingPrice: created.sellingPrice,
                  purchasePrice: created.purchasePrice,
                },
              });
            } catch (e) {
              toolResult = JSON.stringify({
                success: false,
                error: (e as Error).message?.slice(0, 200) || "Failed to create product",
              });
            }
          } else {
            toolResult = JSON.stringify({ success: false, error: "Unknown tool" });
          }
          messages.push({
            role: "tool",
            content: toolResult,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        }
        // Loop again so the AI can either call another tool (next product) or give a final reply.
      }

      if (!finalReply) {
        // Ran out of rounds — build a summary from what was created
        finalReply = createdProducts.length
          ? `Ho gaya bhai! ${createdProducts.length} product add kar diye:\n${createdProducts.map((p) => "• " + p).join("\n")}`
          : "Product add nahi ho paya. Thoda detail mein batao — naam, brand, quantity?";
      }

      // Save to DB (non-blocking)
      try {
        await db.chatMessage.create({ data: { userId: user.id, role: "user", content: message } });
        await db.chatMessage.create({ data: { userId: user.id, role: "assistant", content: finalReply } });
      } catch (dbErr) {
        console.warn("Chat history save failed.", (dbErr as Error)?.message?.slice(0, 80));
      }

      return ok({
        reply: finalReply,
        provider: "openrouter",
        intentType: "ai:add_product",
        productsCreated: createdProducts.length,
      });
    }

    // ---- Default: smart chat (DB-first, then AI fallback) ----
    const histMsgs = (history || []).slice(-8).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const { reply, provider, intentType } = await chatWithMeta(systemPrompt, message, {
      history: histMsgs,
    });

    // Save to DB (non-blocking — don't fail the chat if DB is unavailable)
    try {
      await db.chatMessage.create({
        data: { userId: user.id, role: "user", content: message },
      });
      await db.chatMessage.create({
        data: { userId: user.id, role: "assistant", content: reply },
      });
    } catch (dbErr) {
      console.warn("Chat history save failed (DB unavailable?), skipping.", (dbErr as Error)?.message?.slice(0, 80));
    }

    return ok({ reply, provider, intentType });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("AI chat error:", e);
    return err(aiErrorMessage(e, "AI assistant failed. Please try again."), 500);
  }
}

// ---------------------------------------------------------------------
// Execute the create_product tool: find-or-create category, assign an
// empty location box, insert the product, and record a stock movement.
// ---------------------------------------------------------------------
async function executeCreateProduct(
  args: {
    name?: string;
    brand?: string;
    bikeModels?: string;
    category?: string;
    purchasePrice?: number;
    sellingPrice?: number;
    quantity?: number;
    minStock?: number;
    supplier?: string;
    oemNumber?: string;
  },
  userId: string
): Promise<{
  id: string;
  name: string;
  brand: string;
  category: string;
  locationCode: string;
  quantity: number;
  sellingPrice: number;
  purchasePrice: number;
}> {
  const name = (args.name || "").trim();
  if (!name) throw new Error("Product name is required");

  // Find-or-create category by name
  let categoryId: string | null = null;
  let categoryName = "";
  if (args.category && args.category.trim()) {
    categoryName = args.category.trim();
    const existing = await db.category.findFirst({
      where: { name: { equals: categoryName } },
    });
    if (existing) {
      categoryId = existing.id;
    } else {
      const created = await db.category.create({ data: { name: categoryName } });
      categoryId = created.id;
    }
  }

  // Assign the first empty location box (one not linked to any product)
  let locationId: string | null = null;
  let locationCode = "";
  const takenLocations = await db.product.findMany({
    where: { locationId: { not: null } },
    select: { locationId: true },
  });
  const takenIds = new Set(takenLocations.map((p) => p.locationId).filter(Boolean) as string[]);
  const freeLoc = await db.location.findFirst({
    where: takenIds.size ? { id: { notIn: [...takenIds] } } : {},
    orderBy: { code: "asc" },
  });
  if (freeLoc) {
    locationId = freeLoc.id;
    locationCode = freeLoc.code;
  }

  const purchasePrice = Number(args.purchasePrice) || 0;
  const sellingPrice = Number(args.sellingPrice) || 0;
  const quantity = Number(args.quantity) || 0;
  const minStock = Number(args.minStock) || 5;

  const product = await db.product.create({
    data: {
      name,
      brand: args.brand || "",
      bikeModels: args.bikeModels || "",
      oemNumber: args.oemNumber || "",
      categoryId,
      locationId,
      purchasePrice,
      sellingPrice,
      quantity,
      minStock,
      supplier: args.supplier || "",
    },
  });

  // Record initial stock movement
  if (quantity > 0) {
    await db.movement.create({
      data: {
        productId: product.id,
        type: "ADDED",
        quantity,
        reason: "Added via AI Assistant",
        userId,
      },
    });
  }

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: categoryName,
    locationCode,
    quantity,
    sellingPrice,
    purchasePrice,
  };
}

// GET /api/ai/chat/history — last 30 messages
export async function GET() {
  try {
    const user = await requireUser();
    const messages = await db.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return ok({ messages: messages.reverse() });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch chat history", 500);
  }
}
