import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, err, handleAuthError, cachedOk } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();
    let settings = await db.settings.findUnique({ where: { id: "singleton" } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: "singleton" } });
    }
    // Mask the AI API key for security — only return whether it's set + last 4 chars
    const s = settings as any;
    const aiKeySet = !!s.aiApiKey;
    const aiKeyMasked = aiKeySet ? `••••${String(s.aiApiKey).slice(-4)}` : "";
    return cachedOk({
      settings: {
        ...s,
        aiApiKey: aiKeyMasked,
        aiKeySet,
      },
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch settings", 500);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser();
    const body = await req.json();
    const stringFields = [
      "shopName",
      "ownerName",
      "address",
      "phone",
      "currency",
      "theme",
      "logo",
      "upiId",
      "upiQrImage",
      "upiApps",
      "gstNumber",
      "receiptSize",
      "printerType",
      "whatsappTemplate",
      "thankYouTemplate",
      "billTemplate",
      "billFooter",
      // AI provider config (DB-backed so keys survive Vercel redeployments)
      "aiProvider",
      "aiApiKey",
      "aiTextModel",
      "aiVisionModel",
    ];
    const boolFields = [
      "whatsappEnabled",
      "smsEnabled",
      "backupEnabled",
    ];
    const data: Record<string, string | boolean> = {};
    for (const k of stringFields) {
      if (k in body) {
        const v = String(body[k]);
        // Don't overwrite the real AI key with the masked placeholder
        if (k === "aiApiKey" && v.startsWith("••••")) continue;
        data[k] = v;
      }
    }
    for (const k of boolFields) if (k in body) data[k] = Boolean(body[k]);
    const settings = await db.settings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    return ok({ settings });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to update settings", 500);
  }
}
