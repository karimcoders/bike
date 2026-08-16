import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { getUploadDir, getUploadUrl, hasPersistentStorage } from "@/lib/storage";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/upload?folder=products|logos|qr
// ---------------------------------------------------------------------
// LOCAL-DEV FALLBACK for image uploads.
//
// On Vercel production: Cloudinary is used (browser → Cloudinary direct,
// via /api/cloudinary/sign). This route is NEVER hit in production because
// the sign endpoint returns { configured: true } and the browser uploads
// directly to Cloudinary.
//
// On local dev / sandbox (no CLOUDINARY_* env vars): the sign endpoint
// returns { configured: false }, and the browser falls back to THIS route.
// The file is saved to /public/uploads/<folder>/ and served via
// /api/uploads/<folder>/<filename>.
//
// On Vercel without Cloudinary env vars: this route returns a clear error
// (Vercel's filesystem is read-only — local file saving is impossible).
// =====================================================================

const ALLOWED_FOLDERS = new Set(["products", "logos", "qr"]);
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    // ---- On Vercel without persistent storage, refuse ----
    // (Vercel filesystem is read-only at runtime; saving files would
    // silently succeed but disappear when the serverless function dies.)
    if (process.env.VERCEL && !hasPersistentStorage()) {
      return err(
        "Vercel par local upload possible nahi. Cloudinary configure karein (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
        500
      );
    }

    const folder = (req.nextUrl.searchParams.get("folder") || "products").trim();
    if (!ALLOWED_FOLDERS.has(folder)) {
      return err("Invalid folder. Allowed: products, logos, qr");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return err("No file provided");
    }

    // ---- Validate MIME + size ----
    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return err(
        `Unsupported file type: ${file.type}. Only JPEG, PNG, WebP, GIF allowed.`
      );
    }
    if (file.size > MAX_SIZE) {
      return err("File too large. Max 10 MB.");
    }

    // ---- Generate unique filename ----
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const uploadDir = getUploadDir(folder);
    const fullPath = path.join(uploadDir, filename);

    // ---- Ensure directory exists ----
    await fs.mkdir(uploadDir, { recursive: true });

    // ---- Write file ----
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);

    // ---- Return the serving URL ----
    // The /api/uploads/[...path] route serves files from the upload dir.
    const url = getUploadUrl(folder, filename);
    return ok({ url });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[api/upload] error:", e);
    return err("Upload fail ho gaya. Thodi der baad try karein.", 500);
  }
}
