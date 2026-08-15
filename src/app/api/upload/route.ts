import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { getUploadDir, getUploadUrl } from "@/lib/storage";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";

// =====================================================================
// POST /api/upload?folder=products|logos|qr
// ---------------------------------------------------------------------
// Handles image uploads with Cloudinary as the PRIMARY storage backend
// and local filesystem as a dev-only fallback.
//
// PRODUCTION (Vercel):
//   Vercel has a READ-ONLY filesystem → Cloudinary is REQUIRED.
//   Set these env vars in Vercel:
//     CLOUDINARY_CLOUD_NAME
//     CLOUDINARY_API_KEY
//     CLOUDINARY_API_SECRET
//   The uploaded image returns a Cloudinary secure_url like:
//     https://res.cloudinary.com/<cloud>/image/upload/bike-shop/products/xxx.jpg
//
// DEVELOPMENT (local / sandbox):
//   If Cloudinary env vars are NOT set, falls back to local filesystem:
//     /public/uploads/<folder>/<filename>
//   Served by GET /api/uploads/<folder>/<filename>
//
// The route accepts a single file in FormData (field name "file").
// Returns: { success: true, data: { url: "<cloudinary-or-local-url>" } }
// =====================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
];

const FOLDER_TO_CLOUDINARY: Record<string, string> = {
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

// Lazy-load Cloudinary only when needed (keeps the route fast when
// falling back to local storage in dev, and avoids loading the SDK
// on Vercel if creds aren't set yet).
async function getCloudinary() {
  const { v2: cloudinary } = await import("cloudinary");
  if (!cloudinary.config().cloud_name) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  return cloudinary;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const folder = (req.nextUrl.searchParams.get("folder") ||
      "products") as keyof typeof FOLDER_TO_CLOUDINARY;
    if (!FOLDER_TO_CLOUDINARY[folder]) {
      return err("Invalid folder. Use: products, logos, or qr", 400);
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return err("No file provided", 400);
    }

    // ---- Validate file ----
    if (!ALLOWED_MIMES.includes(file.type)) {
      return err(
        `Unsupported file type: ${file.type}. Use JPG, PNG, WebP, GIF, or BMP.`,
        400
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return err(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
        400
      );
    }

    // ---- Read file bytes once (reused for both Cloudinary and local) ----
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ---- Cloudinary path (production) ----
    if (hasCloudinaryConfig()) {
      try {
        const cloudinary = await getCloudinary();
        const cloudFolder = FOLDER_TO_CLOUDINARY[folder];
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const uniqueId = randomBytes(8).toString("hex");
        const publicId = `${cloudFolder}/${uniqueId}`;

        const result = await cloudinary.uploader.upload(
          `data:${file.type};base64,${buffer.toString("base64")}`,
          {
            public_id: publicId,
            resource_type: "image",
            overwrite: false,
            transformation: [
              { width: 1200, crop: "limit" },
              { quality: "auto" },
              { fetch_format: "auto" },
            ],
          }
        );

        return ok({
          url: result.secure_url,
          publicId: result.public_id,
        });
      } catch (cloudErr: any) {
        console.error("[upload] Cloudinary error:", cloudErr?.message);
        return err(
          "Image upload service me problem hai. Thodi der baad try karein.",
          502
        );
      }
    }

    // ---- Local filesystem fallback (dev / sandbox only) ----
    try {
      const uploadDir = getUploadDir(folder);
      await fs.mkdir(uploadDir, { recursive: true });

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uniqueId = randomBytes(8).toString("hex");
      const filename = `${uniqueId}.${ext}`;
      const filePath = path.join(uploadDir, filename);

      await fs.writeFile(filePath, buffer);

      const url = getUploadUrl(folder, filename);
      return ok({ url });
    } catch (localErr: any) {
      console.error("[upload] Local filesystem error:", localErr?.message);
      return err(
        "Upload fail ho gaya. Vercel par Cloudinary setup zaroori hai.",
        500
      );
    }
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[upload] Unexpected error:", e);
    return err("Upload failed", 500);
  }
}
