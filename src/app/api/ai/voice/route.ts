import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { transcribe, chat, extractJSON, getProductCatalogForAI, searchProductsLocal } from "@/lib/ai";

// POST /api/ai/voice — Voice search: ASR transcription + NL product search
// Body: { audio: "base64-encoded-audio" }
// Returns: { transcript, interpretation, results: Product[] }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { audio } = await req.json();
    if (!audio) return err("Audio data required");

    // 1. Transcribe audio — gracefully handle if no transcription provider available
    let transcript = "";
    try {
      transcript = await transcribe(audio);
    } catch (transcribeErr) {
      console.error("Transcribe failed:", (transcribeErr as Error).message);
      return ok({
        transcript: "",
        interpretation: "Voice search abhi kaam nahi kar raha. Text search use karein — typing se product dhundh sakte hain.",
        results: [],
        provider: "none",
      });
    }

    if (!transcript || !transcript.trim()) {
      return ok({
        transcript: "",
        interpretation: "Kuch sunai nahi diya. Dobara try karein.",
        results: [],
      });
    }

    // 2. Run NL search on the transcript — try local search first (instant, no AI needed)
    const catalog = await getProductCatalogForAI(150);
    const local = searchProductsLocal(transcript, catalog);

    // If local search found matches, return them immediately
    if (local.matches.length > 0) {
      const results: any[] = [];
      for (const id of local.matches) {
        try {
          const p = await db.product.findUnique({
            where: { id },
            include: { category: true, location: true },
          });
          if (p) results.push(p);
        } catch {}
      }
      return ok({
        transcript,
        interpretation: local.interpretation,
        results,
        provider: "local",
      });
    }

    // 3. If local search found nothing, try AI-powered search
    const systemPrompt = `You are a product search engine for a bike spare-parts shop in rural Bihar. The user spoke in Hindi/Bhojpuri/Hinglish (transcribed via speech-to-text, may have minor errors).

Transcript: "${transcript}"

Catalog (JSON array):
${JSON.stringify(catalog)}

Understand bike model names (Splendor, HF Deluxe, Passion, Pulsar, etc.) and part names in any language. Respond with ONLY valid JSON (no markdown):
{
  "interpretation": "short Hinglish note of what the user wants",
  "matches": ["productId1", "productId2", ...]
}
If nothing matches, return { "interpretation": "...", "matches": [] }.`;

    let raw: string;
    try {
      raw = await chat(systemPrompt, transcript);
    } catch (chatErr) {
      // AI chat failed — return transcript with no results
      return ok({
        transcript,
        interpretation: `"${transcript}" — matching product nahi mila. Text search try karein.`,
        results: [],
        provider: "none",
      });
    }

    const parsed = extractJSON<{ interpretation: string; matches: string[] }>(raw);

    const results: any[] = [];
    const matches = parsed?.matches || [];
    for (const id of matches) {
      try {
        const p = await db.product.findUnique({
          where: { id },
          include: { category: true, location: true },
        });
        if (p) results.push(p);
      } catch {}
    }

    return ok({
      transcript,
      interpretation: parsed?.interpretation || "",
      results,
      provider: "ai",
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Voice search error:", e);
    return err("Voice search failed. Please try text search.", 500);
  }
}
