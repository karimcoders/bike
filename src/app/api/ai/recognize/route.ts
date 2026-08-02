import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { visionChat, extractJSON, aiErrorMessage, hasAIProvider } from "@/lib/ai";

// POST /api/ai/recognize — Smart product recognition from a photo (VLM)
// Body: { image: "data:image/...;base64,..." or URL }
// Returns: { recognized: { name, brand, oemNumber, category, bikeModels, suggestedSellingPrice, suggestedPurchasePrice, notes } }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { image } = await req.json();
    if (!image) return err("Image required");

    // Check if vision AI is available (Gemini or Z.ai). Groq is text-only.
    const hasVision = await hasAIProvider();
    if (!hasVision) {
      return ok({
        recognized: null,
        message:
          "Photo scan ke liye AI vision provider chahiye (Gemini ya Z.ai). " +
          "Abhi manually product details bhar ein. " +
          "Free vision ke liye https://aistudio.google.com/app/apikey se key lein.",
        provider: "none",
      });
    }

    const prompt = `You are an expert in bike spare parts. Look at this image and identify the part. Respond with ONLY valid JSON (no markdown) in this exact format:
{
  "name": "exact part name, e.g. Brake Shoe Set (Front)",
  "brand": "brand if visible on packaging, else empty string",
  "oemNumber": "OEM/part number if visible, else empty string",
  "category": "one of: Engine, Brake, Electrical, Tyre, Oil, Chain Kit, Body Parts, Accessories, Bearings, Cables, Filters",
  "bikeModels": "comma separated compatible bike models, e.g. Splendor+,HF Deluxe,Passion Pro (use 'Universal' if generic)",
  "suggestedPurchasePrice": number (estimated purchase price in INR),
  "suggestedSellingPrice": number (estimated selling price in INR for a small Bihar shop),
  "notes": "any useful detail visible on the part/packaging",
  "confidence": "high | medium | low"
}
If the image is not a bike part, return { "name": "", "confidence": "low", "notes": "Image does not appear to be a bike part" }.`;

    const raw = await visionChat(prompt, image);
    const recognized = extractJSON<any>(raw);

    if (!recognized) {
      return ok({
        recognized: null,
        rawText: raw,
        message: "Could not parse AI response. Try a clearer photo.",
      });
    }

    return ok({ recognized });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Recognize error:", e);
    return err(aiErrorMessage(e, "Product recognition failed. Please try again."), 500);
  }
}
