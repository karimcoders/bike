import { NextRequest, NextResponse } from "next/server";

// =====================================================================
// GET /api/uploads/<folder>/<filename>
// ---------------------------------------------------------------------
// Serves uploaded image files from LOCAL storage (dev only).
//
// On Vercel/production: Cloudinary is used, so uploaded files have URLs
// like https://res.cloudinary.com/... and this route is NOT needed.
//
// Locally: /public/uploads/<folder>/<filename>
//
// This route is kept for local dev backward-compat. It dynamically
// imports `fs` so Vercel's serverless build doesn't fail on the
// read-only filesystem restriction.
// =====================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
  gif: { mime: "image/gif", ext: "gif" },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // ---- Validate path segments (prevent directory traversal) ----
  if (!segments || segments.length === 0) {
    return NextResponse.json(
      { error: "No file path provided" },
      { status: 400 }
    );
  }

  for (const seg of segments) {
    if (seg.includes("..") || seg.startsWith("/")) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }
  }

  // ---- Determine file location (local dev only) ----
  const relativePath = segments.join("/");
  const hasVolume = Boolean(
    process.env.RAILWAY_VOLUME_MOUNT_DIR || process.env.STORAGE_DIR
  );

  // On Vercel/production without volume, local file serving is unavailable
  if (process.env.VERCEL && !hasVolume) {
    return NextResponse.json(
      {
        error:
          "Local file serving not available on Vercel. Use Cloudinary for uploads.",
        path: relativePath,
      },
      { status: 404 }
    );
  }

  // Dynamically import fs & path to avoid Vercel build issues
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const { getStorageRoot } = await import("@/lib/storage");

  const storageRoot = getStorageRoot();
  const uploadsRoot = hasVolume
    ? path.join(storageRoot, "uploads")
    : path.join(storageRoot, "public", "uploads");
  const fullPath = path.join(uploadsRoot, ...segments);

  if (!fullPath.startsWith(uploadsRoot)) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403 }
    );
  }

  try {
    await fs.access(fullPath);
  } catch {
    return NextResponse.json(
      { error: "File not found", path: relativePath },
      { status: 404 }
    );
  }

  const ext = path.extname(fullPath).slice(1).toLowerCase();
  const mimeInfo = MIME_MAP[ext];
  if (!mimeInfo) {
    return NextResponse.json(
      { error: `Unsupported file type: .${ext}` },
      { status: 415 }
    );
  }

  try {
    const fileBuffer = await fs.readFile(fullPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeInfo.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (e) {
    console.error("[api/uploads] readFile failed:", e);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
