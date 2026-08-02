import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { visionChat, extractJSON, hasAIProvider } from "@/lib/ai";

// POST /api/ai/recognize — Smart product recognition from a photo (VLM)
// Body: { image: "data:image/...;base64,..." or URL }
// Returns: { recognized: { name, brand, oemNumber, category, bikeModels, suggestedSellingPrice, suggestedPurchasePrice, notes } }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { image } = await req.json();
    if (!image) return err("Image required");

    // Check if vision AI is available
    const hasVision = await hasAIProvider();
    if (!hasVision) {
      return ok({
        recognized: null,
        message:
          "AI vision abhi available nahi hai. Form manually bhar ein — bas 30 second lagenge. " +
          "AI scan enable karne ke liye Vercel me GROQ_API_KEY ya OPENROUTER_API_KEY set karein.",
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

    let raw: string;
    try {
      raw = await visionChat(prompt, image);
    } catch (visionErr) {
      // Vision providers all failed — return friendly response, NOT a 500 error
      console.error("Vision chat failed:", (visionErr as Error).message);
      return ok({
        recognized: null,
        message:
          "AI scan abhi kaam nahi kar raha. Form manually bhar ein — 30 second me ho jayega. " +
          "AI scan ke liye Vercel me OPENROUTER_API_KEY (free, openrouter.ai/keys) set karein.",
        provider: "none",
      });
    }

    const recognized = extractJSON<any>(raw);

    if (!recognized) {
      return ok({
        recognized: null,
        rawText: raw,
        message: "AI response parse nahi hua. Try a clearer photo ya manually bhar ein.",
      });
    }

    return ok({ recognized });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("Recognize error:", e);
    return err("Product recognition failed. Please try again or fill manually.", 500);
  }
}
