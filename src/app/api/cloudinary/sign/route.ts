import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// GET /api/cloudinary/sign?folder=products|logos|qr
// ---------------------------------------------------------------------
// Returns a short-lived signed payload so the BROWSER can upload
// directly to Cloudinary — bypassing the Vercel serverless function
// for the actual file transfer. This is critical for performance:
//
//   BEFORE:  Browser → /api/upload (Vercel) → Cloudinary
//            (entire file buffered in serverless memory + 2 hops)
//
//   AFTER:   Browser → Cloudinary (direct, signed)
//            (one hop, no serverless memory pressure, no timeout)
//
// The signature covers `folder` + `timestamp` only. We do NOT pin a
// transformation on upload — the original is stored, and delivery-time
// transformations (w_300,q_auto,f_auto etc.) are applied via URL params
// when images are rendered. This keeps the stored asset flexible and
// lets us serve tiny thumbnails for product cards.
//
// Returns: { cloudName, apiKey, timestamp, signature, folder }
// The client then POSTs multipart/form-data to:
//   https://api.cloudinary.com/v1_1/<cloudName>/image/upload
// with fields: file, folder, timestamp, api_key, signature
// =====================================================================

const FOLDER_MAP: Record<string, string> = {
  products: "bike-shop/products",
  logos: "bike-shop/logos",
  qr: "bike-shop/qr",
};

function hasCloudinaryConfig(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();

    if (!hasCloudinaryConfig()) {
      // Tell the client to fall back to the server upload route.
      return ok({ configured: false });
    }

    const folder = req.nextUrl.searchParams.get("folder") || "products";
    const cloudFolder = FOLDER_MAP[folder] || FOLDER_MAP.products;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = process.env.CLOUDINARY_API_KEY!;
    const apiSecret = process.env.CLOUDINARY_API_SECRET!;

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature = SHA1(sorted "k=v" pairs + api_secret).
    // We sign only folder + timestamp. The client must send exactly
    // these params (plus file/api_key/signature) for the signature to
    // validate. Building it manually avoids importing the SDK here (keeps
    // the route lightweight — no cloudinary package on the request path).
    const paramsToSign = `folder=${cloudFolder}&timestamp=${timestamp}`;
    const signature = await sha1Hex(paramsToSign + apiSecret);

    return ok({
      configured: true,
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: cloudFolder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[cloudinary/sign] error:", e);
    return err("Failed to sign upload", 500);
  }
}

// SHA-1 using the Web Crypto API (available in Node 18+/Vercel runtime).
async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
