import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, extractJSON, aiErrorMessage } from "@/lib/ai";

// GET /api/ai/duplicates — Detect potential duplicate products using AI
export async function GET() {
  try {
    await requireUser();
    const products = await db.product.findMany({
      select: { id: true, name: true, brand: true, oemNumber: true, bikeModels: true, categoryId: true, category: { select: { name: true } }, quantity: true },
      orderBy: { name: "asc" },
    });

    const systemPrompt = `You are a data deduplication engine for a bike spare-parts inventory. Find products that are likely DUPLICATES of each other (same part entered with slight name variations, e.g. "Brake Shoe" vs "Brake Shoes" vs "Front Brake Shoe" vs "Brake Shoe Front").

Products (JSON):
${JSON.stringify(products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, oem: p.oemNumber, bikes: p.bikeModels, category: p.category?.name })))}

Respond with ONLY valid JSON (no markdown):
{
  "groups": [
    {
      "products": ["id1", "id2"],
      "reason": "Hinglish explanation of why these are duplicates",
      "suggestedName": "the canonical name to keep"
    }
  ]
}

Only group products that are genuinely the same part. If no duplicates exist, return { "groups": [] }.`;

    const raw = await chat(systemPrompt, "Find duplicate products.");
    const parsed = extractJSON<{ groups: { products: string[]; reason: string; suggestedName: string }[] }>(raw);

    return ok({ groups: parsed?.groups || [] });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Duplicates error:", e);
    return err(aiErrorMessage(e, "Failed to detect duplicates"), 500);
  }
}
