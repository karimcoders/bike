import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/receipt-message
// Body: { saleId: string }
// Returns: { message: string } — a short Hinglish personalized thank-you + service tip
//           suitable for printing at the bottom of a bill receipt.
export async function POST(req: Request) {
  try {
    await requireUser();
    const { saleId } = await req.json();
    if (!saleId) return err("saleId required", 400);

    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { select: { name: true, quantity: true } },
        customer: { select: { name: true, type: true } },
      },
    });
    if (!sale) return err("Sale not found", 404);

    const itemsList = sale.items
      .map((i) => `${i.name} (${i.quantity})`)
      .join(", ");
    const customerName = sale.customer?.name || "Customer";

    const systemPrompt = `You are a friendly bike shop assistant in rural Bihar. Write a SHORT (max 2 lines) personalized Hinglish message for a customer's bill receipt. Use Hinglish (Hindi + English mix, roman script). Be warm, practical, and specific to what they bought. Include a service/maintenance tip related to the parts purchased when possible. Use emojis sparingly (1 max). Do NOT use markdown, quotes, or newlines. Just plain text. Max 120 characters.`;

    const userMessage = `Customer: ${customerName}
Items purchased: ${itemsList}
Total: ₹${sale.total}
Payment mode: ${sale.paymentMode}
${sale.paymentMode === "CREDIT" ? "This is an udhaar (credit) sale." : ""}

Write a short personalized thank-you message for their bill receipt. Example style: "⭐ Thank you Raju Ji! Brake shoe 6 mahine baad check karwana na bhulein."`;

    const raw = await chat(systemPrompt, userMessage);
    // Clean up the response — strip quotes, newlines, markdown
    const message = raw
      .trim()
      .replace(/^["'`]|["'`]$/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 200);

    return ok({ message });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Receipt message error:", e);
    return err(aiErrorMessage(e, "AI message generate nahi ho paya"), 500);
  }
}
