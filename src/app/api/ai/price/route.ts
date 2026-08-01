import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, extractJSON } from "@/lib/ai";

// POST /api/ai/price — Smart price recommendation for a product
// Body: { productId: string }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { productId } = await req.json();
    if (!productId) return err("Product ID required");

    const product = await db.product.findUnique({
      where: { id: productId },
      include: { category: { select: { name: true } } },
    });
    if (!product) return err("Product not found", 404);

    // Gather similar products for context
    const similar = await db.product.findMany({
      where: {
        OR: [
          { name: { contains: product.name.split(" ")[0] } },
          { brand: product.brand },
        ],
        id: { not: product.id },
      },
      take: 10,
      select: { name: true, brand: true, purchasePrice: true, sellingPrice: true, quantity: true },
    });

    const systemPrompt = `You are a pricing expert for a bike spare-parts shop in rural Bihar. Recommend a selling price.

Product: ${product.name}
Brand: ${product.brand}
Category: ${product.category?.name || "N/A"}
Current purchase price: ₹${product.purchasePrice}
Current selling price: ₹${product.sellingPrice}
Current stock: ${product.quantity} units
Min stock: ${product.minStock}

Similar products in shop for reference:
${JSON.stringify(similar)}

Respond with ONLY valid JSON (no markdown):
{
  "suggestedPrice": number,
  "margin": number (percentage),
  "profit": number (INR per unit),
  "reasoning": "2-3 line Hinglish reasoning considering purchase price, market rates, stock level, and competition",
  "action": "keep | increase | decrease"
}`;

    const raw = await chat(systemPrompt, "Recommend the best selling price.");
    const parsed = extractJSON<any>(raw);

    if (!parsed) {
      // Fallback: 25% margin
      const suggested = Math.round(product.purchasePrice * 1.25);
      return ok({
        suggestedPrice: suggested,
        margin: 25,
        profit: suggested - product.purchasePrice,
        reasoning: "Basic 25% margin suggested (AI unavailable).",
        action: "keep",
      });
    }

    return ok(parsed);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Price recommendation error:", e);
    return err("Failed to generate price recommendation", 500);
  }
}
