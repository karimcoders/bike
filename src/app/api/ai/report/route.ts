import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, getShopSnapshot, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/report — Generate a natural language business report
// Body: { type: "daily" | "weekly" | "insights" }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { type } = await req.json();
    const reportType = type || "daily";

    const snapshot = await getShopSnapshot();

    // Fetch detailed sales for the period
    const days = reportType === "weekly" ? 7 : 1;
    const start = new Date(Date.now() - days * 86400000);
    const sales = await db.sale.findMany({
      where: { createdAt: { gte: start } },
      include: { items: { select: { name: true, quantity: true, subtotal: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const salesData = sales.map((s) => ({
      time: s.createdAt.toISOString(),
      customer: s.customer?.name || "Walk-in",
      items: s.items.length,
      total: s.total,
      profit: s.profit,
      topItem: s.items[0]?.name,
    }));

    const systemPrompt = `You are an AI business reporter for a bike spare-parts shop in rural Bihar (shop: ${snapshot.shopName}, owner: ${snapshot.ownerName}). Generate a clear, practical report in Hinglish (Hindi + English mix). Use simple language, bullet points, and emojis where helpful.

Shop snapshot:
- Total products: ${snapshot.totals.products} (${snapshot.totals.units} units)
- Out of stock: ${snapshot.totals.outOfStock}, Low stock: ${snapshot.totals.lowStock}
- Stock value: ₹${Math.round(snapshot.totals.stockValue).toLocaleString("en-IN")}

${reportType === "weekly" ? "Last 7 days" : "Today's"} sales (${salesData.length} transactions):
${JSON.stringify(salesData)}

Top sellers (30 days):
${snapshot.topSellers.map((t) => `- ${t.name}: ${t.qty} units, ₹${Math.round(t.revenue)}`).join("\n") || "- No data"}

Generate a report with these sections (use Markdown headings and bullets):
## 📊 ${reportType === "weekly" ? "Weekly" : "Daily"} Report

### Sales Summary
- Total sales, revenue, profit
- Best selling item

### Stock Status
- Alerts (out of stock, low stock items)
- Stock value

### Top Performers
- Best selling products

### 💡 AI Recommendations
- 2-3 practical suggestions (restock what, push what, discount what)

### 🎯 Action Items
- 2-3 concrete next steps for the owner

Keep it concise and actionable. The owner reads this on their phone.`;

    const report = await chat(systemPrompt, `Generate ${reportType} report.`);
    return ok({ report, type: reportType, generatedAt: new Date().toISOString() });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Report error:", e);
    return err(aiErrorMessage(e, "Failed to generate report"), 500);
  }
}
