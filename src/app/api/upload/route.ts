import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";

// =====================================================================
// POST /api/upload?folder=<folder>
// ---------------------------------------------------------------------
// Handles image file uploads from the frontend.
//
// - Auth required (any logged-in user can upload)
// - Folder must be in the whitelist (products | logos | qr)
// - Only image MIME types allowed (png, jpg, jpeg, webp, gif)
// - Max file size: 5 MB
//
// STORAGE STRATEGY (Vercel-compatible):
//   - PRIMARY: Cloudinary (if env vars configured) → returns CDN URL
//   - FALLBACK: Local filesystem (dev only) — dynamically imported
//     so Vercel's build doesn't choke on `fs` in serverless context
//
// On Vercel (serverless, read-only filesystem), Cloudinary is REQUIRED.
// Set: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//
// Returns: { url: "https://res.cloudinary.com/..." or "/api/uploads/..." }
// =====================================================================

// Force Node.js runtime (not Edge) for file buffer handling
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Folders that can be uploaded to (prevents arbitrary path creation)
const ALLOWED_FOLDERS = ["products", "logos", "qr"] as const;

// MIME type → extension mapping (whitelist of allowed image types)
const MIME_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  // ---- Auth: any logged-in user can upload ----
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ---- If Cloudinary is NOT configured, fail fast with clear error ----
  // (Vercel's filesystem is read-only, so local fallback won't work there)
  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      {
        error:
          "Photo upload not configured. Cloudinary env vars required (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
        code: "CLOUDINARY_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  // ---- Parse folder from query ----
  const folder = req.nextUrl.searchParams.get("folder") || "products";
  if (!ALLOWED_FOLDERS.includes(folder as (typeof ALLOWED_FOLDERS)[number])) {
    return NextResponse.json(
      { error: `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(", ")}` },
      { status: 400 }
    );
  }

  // ---- Parse multipart form data ----
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. Expected multipart/form-data with a 'file' field." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided. Include a 'file' field in the form data." },
      { status: 400 }
    );
  }

  // ---- Validate MIME type ----
  const mimeType = file.type;
  if (!MIME_MAP[mimeType]) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${mimeType || "unknown"}. Allowed: PNG, JPEG, WebP, GIF.`,
      },
      { status: 415 }
    );
  }

  // ---- Validate file size ----
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max: ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      },
      { status: 413 }
    );
  }

  // ---- Read file bytes ----
  let fileBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Failed to read file data." },
      { status: 500 }
    );
  }

  // ---- Upload to Cloudinary ----
  try {
    const url = await uploadToCloudinary(fileBuffer, folder, mimeType);
    return NextResponse.json({ url }, { status: 200 });
  } catch (e) {
    console.error("[api/upload] Cloudinary upload failed:", e);
    return NextResponse.json(
      { error: "Failed to upload to Cloudinary. Check credentials." },
      { status: 500 }
    );
  }
}
