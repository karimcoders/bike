import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { chat, extractJSON, getProductCatalogForAI, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/search — Natural language product search
// Body: { query: string }
// Returns: { interpretation, results: Product[] }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { query } = await req.json();
    if (!query || !query.trim()) return err("Search query required");

    const catalog = await getProductCatalogForAI(150);

    const systemPrompt = `You are a product search engine for a bike spare-parts shop. The user speaks Hindi, Bhojpuri, or English (Hinglish).

Given the user's query, find the best matching products from this catalog. Understand synonyms, bike model names, and part names in any language.

Catalog (JSON array):
${JSON.stringify(catalog)}

Respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "interpretation": "short Hinglish note of what the user is looking for, e.g. 'Splendor ka front brake shoe dhoondh rahe hain'",
  "matches": ["productId1", "productId2", ...]  // ordered by best match first, max 8
}

If nothing matches, return { "interpretation": "...", "matches": [] }.`;

    const raw = await chat(systemPrompt, query);
    const parsed = extractJSON<{ interpretation: string; matches: string[] }>(raw);

    if (!parsed) {
      return ok({
        interpretation: "Samajh nahi aaya, dobara try karein.",
        results: [],
      });
    }

    // Fetch full product objects in the order returned
    const results: any[] = [];
    for (const id of parsed.matches || []) {
      const p = await db.product.findUnique({
        where: { id },
        include: { category: true, location: true },
      });
      if (p) results.push(p);
    }

    return ok({
      interpretation: parsed.interpretation || "",
      results,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("AI search error:", e);
    return err(aiErrorMessage(e, "Search failed. Please try again."), 500);
  }
}
