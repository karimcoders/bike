import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { visionChat, extractJSON, aiErrorMessage, hasAIProvider } from "@/lib/ai";

// POST /api/ai/ocr — OCR invoice scanner: extract products from a supplier invoice photo (VLM)
// Body: { image: "data:image/...;base64,..." or URL }
// Returns: { supplier, invoiceNo, date, items: [{name, qty, price, total}], grandTotal }
export async function POST(req: Request) {
  try {
    await requireUser();
    const { image } = await req.json();
    if (!image) return err("Image required");

    const hasVision = await hasAIProvider();
    if (!hasVision) {
      return ok({
        supplier: "",
        invoiceNo: "",
        date: "",
        items: [],
        grandTotal: 0,
        message:
          "Invoice scan ke liye AI vision provider chahiye (Gemini ya Z.ai). " +
          "Items manually add karein. " +
          "Free vision ke liye https://aistudio.google.com/app/apikey se key lein.",
        provider: "none",
      });
    }

    const prompt = `You are an OCR engine for bike spare-parts supplier invoices/bills in India. Read the invoice in the image carefully. Respond with ONLY valid JSON (no markdown) in this exact format:
{
  "supplier": "supplier/shop name from the invoice, empty string if not found",
  "invoiceNo": "invoice/bill number, empty string if not found",
  "date": "invoice date in YYYY-MM-DD format if visible, else empty string",
  "items": [
    { "name": "product/part name as printed", "qty": number, "price": number (unit price in INR), "total": number (line total in INR) }
  ],
  "grandTotal": number (invoice grand total in INR, 0 if not found)
}
Only include actual product line items, not headers or totals. If qty is not visible, assume 1. If the image is not an invoice, return { "supplier": "", "items": [], "grandTotal": 0 }.`;

    const raw = await visionChat(prompt, image);
    const parsed = extractJSON<any>(raw);

    if (!parsed) {
      return ok({
        supplier: "",
        invoiceNo: "",
        date: "",
        items: [],
        grandTotal: 0,
        rawText: raw,
        message: "Could not parse invoice. Try a clearer photo.",
      });
    }

    return ok({
      supplier: parsed.supplier || "",
      invoiceNo: parsed.invoiceNo || "",
      date: parsed.date || "",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      grandTotal: parsed.grandTotal || 0,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("OCR error:", e);
    return err(aiErrorMessage(e, "Invoice scanning failed. Please try again."), 500);
  }
}
