import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/daily-closing — generate today's closing report with AI narrative
export async function POST() {
  try {
    await requireUser();

    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    // Fetch today's sales with items
    const todaySales = await db.sale.findMany({
      where: { createdAt: { gte: startToday } },
      include: { items: true, customer: { select: { name: true } } },
    });

    const salesCount = todaySales.length;
    const totalRevenue = todaySales.reduce((s, x) => s + x.total, 0);
    const totalProfit = todaySales.reduce((s, x) => s + x.profit, 0);
    const cashTotal = todaySales.reduce((s, x) => s + x.cashAmount, 0);
    const upiTotal = todaySales.reduce((s, x) => s + x.upiAmount, 0);
    const creditTotal = todaySales.reduce((s, x) => s + x.creditAmount, 0);
    const itemsSold = todaySales.reduce(
      (s, x) => s + x.items.reduce((a, b) => a + b.quantity, 0),
      0
    );

    // New customers today
    const newCustomers = await db.customer.count({
      where: { createdAt: { gte: startToday } },
    });

    // Top selling parts today
    const itemMap = new Map<
      string,
      { name: string; brand: string; qty: number; revenue: number }
    >();
    for (const sale of todaySales) {
      for (const it of sale.items) {
        const cur = itemMap.get(it.name) || {
          name: it.name,
          brand: "",
          qty: 0,
          revenue: 0,
        };
        cur.qty += it.quantity;
        cur.revenue += it.subtotal;
        itemMap.set(it.name, cur);
      }
    }
    // Enrich with brand info
    const topSelling = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    // Low stock items (quantity <= minStock) — fetch all then filter in JS
    // (Prisma cannot compare two columns of the same row directly in a where clause).
    const lowStockCandidates = await db.product.findMany({
      where: { quantity: { lte: 10 } },
      orderBy: { quantity: "asc" },
      select: {
        name: true,
        brand: true,
        quantity: true,
        minStock: true,
      },
    });
    const lowStockProducts = lowStockCandidates
      .filter((p) => p.quantity <= p.minStock)
      .slice(0, 12);

    // Outstanding credit total — compute manually to avoid Prisma aggregate
    // type issues with newly added Float fields
    const allCustomers = await db.customer.findMany({
      select: { outstanding: true },
    });
    const totalOutstanding = allCustomers.reduce(
      (s, c) => s + (c.outstanding || 0),
      0
    );

    const summary = {
      totalSales: salesCount,
      totalRevenue,
      totalProfit,
      cashTotal,
      upiTotal,
      creditTotal,
      salesCount,
      newCustomers,
      itemsSold,
    };

    // Build AI prompt for narrative + tomorrow's purchase suggestions
    const settings = await db.settings.findUnique({ where: { id: "singleton" } });
    const shopName = settings?.shopName || "Bike Shop";

    const topSellersText = topSelling
      .map((t) => `- ${t.name}: ${t.qty} pcs, ₹${t.revenue}`)
      .join("\n");

    const lowStockText = lowStockProducts
      .map(
        (p) =>
          `- ${p.name} (${p.brand}): ${p.quantity}/${p.minStock} pcs left`
      )
      .join("\n");

    const systemPrompt = `Tu ek Bihar ke bike spare-parts dukaan ka AI assistant "ShopMitra" hai. Owner ko Hindi + English (Hinglish) me daily closing report banana hai. Tone friendly, professional, aur encouraging rakh. Rural Bihar context yaad rakho.`;

    const userPrompt = `Aaj ki closing report banao aur kal ke liye purchase suggestions do:

Dukaan: ${shopName}
Date: ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}

Aaj ki sales summary:
- Total bills: ${salesCount}
- Total revenue: ₹${totalRevenue.toLocaleString("en-IN")}
- Total profit: ₹${totalProfit.toLocaleString("en-IN")}
- Cash: ₹${cashTotal.toLocaleString("en-IN")}
- UPI: ₹${upiTotal.toLocaleString("en-IN")}
- Credit (Udhaar): ₹${creditTotal.toLocaleString("en-IN")}
- Items sold: ${itemsSold}
- New customers: ${newCustomers}
- Total outstanding (sab customers ka): ₹${totalOutstanding.toLocaleString("en-IN")}

Top selling parts aaj:
${topSellersText || "- Koi sale nahi hui aaj"}

Low stock items (restock zaroorat):
${lowStockText || "- Sab stock healthy hai"}

Is data ke basis par:
1. Ek short encouraging summary do (2-3 lines) — aaj kaisa raha
2. Payment breakdown mention karo (cash/UPI/credit)
3. Top 3-5 parts jo kal ke liye zaroor purchase karne chahiye (low stock + aaj bikne wale)
4. Outstanding credit ke baare me ek line — kitna collect karna padega
5. Kal ke liye 2-3 actionable tips (e.g. "Yeh part zyada bik raha hai, extra stock rakho")

Format: Markdown with headings (## sections). Hinglish me likho. 200-300 words me.`;

    let aiReport = "";
    try {
      aiReport = await chat(systemPrompt, userPrompt);
    } catch (e) {
      console.error("AI daily closing failed:", e);
      aiReport = `## Aaj Ki Closing Report

**Total Revenue:** ₹${totalRevenue.toLocaleString("en-IN")}
**Total Profit:** ₹${totalProfit.toLocaleString("en-IN")}
**Total Bills:** ${salesCount}

### Payment Breakdown
- Cash: ₹${cashTotal.toLocaleString("en-IN")}
- UPI: ₹${upiTotal.toLocaleString("en-IN")}
- Credit: ₹${creditTotal.toLocaleString("en-IN")}

### Items Sold
${itemsSold} units across ${salesCount} bills.

### New Customers
${newCustomers} naye customers aaj banaye.

### Outstanding
Total ₹${totalOutstanding.toLocaleString("en-IN")} collect karna baki hai.

*(AI narrative temporarily unavailable — showing raw summary)*`;
    }

    const report = {
      date: now.toISOString(),
      summary,
      topSelling,
      lowStock: lowStockProducts,
      outstanding: totalOutstanding,
      aiReport,
      generatedAt: now.toISOString(),
    };

    return ok({ report });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err(aiErrorMessage(e, "Failed to generate daily closing report"), 500);
  }
}
