import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, getShopSnapshot, getProductCatalogForAI, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/chat — AI Shop Assistant (Hinglish, shop-aware)
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { message, history } = await req.json();
    if (!message) return err("Message required");

    const [snapshot, catalog] = await Promise.all([
      getShopSnapshot(),
      getProductCatalogForAI(100),
    ]);

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
- For recommendations, suggest related parts from the catalog.`;

    // Build history (last 8 messages)
    const histMsgs = (history || []).slice(-8).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const reply = await chat(systemPrompt, message, { history: histMsgs });

    // Save to DB
    await db.chatMessage.create({
      data: { userId: user.id, role: "user", content: message },
    });
    await db.chatMessage.create({
      data: { userId: user.id, role: "assistant", content: reply },
    });

    return ok({ reply });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("AI chat error:", e);
    return err(aiErrorMessage(e, "AI assistant failed. Please try again."), 500);
  }
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
