import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { transcribe, chat, extractJSON, getProductCatalogForAI, aiErrorMessage } from "@/lib/ai";

// POST /api/ai/voice — Voice search: ASR transcription + NL product search
// Body: { audio: "base64-encoded-audio" }
// Returns: { transcript, interpretation, results: Product[] }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { audio } = await req.json();
    if (!audio) return err("Audio data required");

    // 1. Transcribe audio
    const transcript = await transcribe(audio);
    if (!transcript || !transcript.trim()) {
      return ok({
        transcript: "",
        interpretation: "Kuch sunai nahi diya. Dobara try karein.",
        results: [],
      });
    }

    // 2. Run NL search on the transcript
    const catalog = await getProductCatalogForAI(150);
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

    const raw = await chat(systemPrompt, transcript);
    const parsed = extractJSON<{ interpretation: string; matches: string[] }>(raw);

    const results: any[] = [];
    if (parsed) {
      for (const id of parsed.matches || []) {
        const p = await db.product.findUnique({
          where: { id },
          include: { category: true, location: true },
        });
        if (p) results.push(p);
      }
    }

    return ok({
      transcript,
      interpretation: parsed?.interpretation || "",
      results,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Voice search error:", e);
    return err(aiErrorMessage(e, "Voice search failed. Please try again."), 500);
  }
}
