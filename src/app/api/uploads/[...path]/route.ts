import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getStorageRoot } from "@/lib/storage";

// =====================================================================
// GET /api/uploads/<folder>/<filename>
// ---------------------------------------------------------------------
// Serves uploaded image files from the storage directory.
//
// - Locally: /public/uploads/<folder>/<filename>
// - On Railway (with volume): /data/uploads/<folder>/<filename>
//
// The storage root is auto-detected by lib/storage.ts based on env:
//   - RAILWAY_VOLUME_MOUNT_DIR (set by Railway when volume attached)
//   - STORAGE_DIR (manual override for other platforms)
//   - process.cwd() (default for local dev)
//
// WHY THIS EXISTS:
//   Files in /public/ are normally served as static files by Next.js
//   at the root path (e.g. /uploads/products/x.png). However, when the
//   app is accessed through a preview panel / reverse proxy, static
//   file paths like /uploads/... may NOT be proxied correctly (the
//   proxy might only forward /api/* requests). This route ensures
//   uploaded images are served through the SAME /api/* routing that
//   all other data requests use, so they work regardless of proxy
//   configuration.
//
// SECURITY:
//   - Path is validated to prevent directory traversal (.. is rejected)
//   - Only files inside the uploads root are served
//   - MIME types are whitelisted (images only)
// =====================================================================

const MIME_MAP: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
  gif: { mime: "image/gif", ext: "gif" },
};

export const runtime = "nodejs";

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

  // Reject any segment containing ".." or starting with "/"
  for (const seg of segments) {
    if (seg.includes("..") || seg.startsWith("/")) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }
  }

  // ---- Determine file location (auto-detects Railway volume vs local) ----
  const relativePath = segments.join("/");
  const storageRoot = getStorageRoot();
  // On Railway/with STORAGE_DIR: <storageRoot>/uploads/<folder>/<file>
  // Locally: <cwd>/public/uploads/<folder>/<file>
  const hasVolume = Boolean(
    process.env.RAILWAY_VOLUME_MOUNT_DIR || process.env.STORAGE_DIR
  );
  const uploadsRoot = hasVolume
    ? path.join(storageRoot, "uploads")
    : path.join(storageRoot, "public", "uploads");
  const fullPath = path.join(uploadsRoot, ...segments);

  // Ensure the resolved path is still inside the uploads root
  if (!fullPath.startsWith(uploadsRoot)) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403 }
    );
  }

  // ---- Check file exists ----
  try {
    await fs.access(fullPath);
  } catch {
    return NextResponse.json(
      { error: "File not found", path: relativePath },
      { status: 404 }
    );
  }

  // ---- Determine MIME from extension ----
  const ext = path.extname(fullPath).slice(1).toLowerCase();
  const mimeInfo = MIME_MAP[ext];
  if (!mimeInfo) {
    return NextResponse.json(
      { error: `Unsupported file type: .${ext}` },
      { status: 415 }
    );
  }

  // ---- Read and serve ----
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
