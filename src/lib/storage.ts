// =====================================================================
// STORAGE PATH UTILITY
// ---------------------------------------------------------------------
// Resolves where uploaded files are stored AND where the SQLite DB lives.
//
// - DEVELOPMENT (local / sandbox):
//   Files → /public/uploads/<folder>/
//   DB    → ./db/custom.db  (or wherever DATABASE_URL points)
//
// - RAILWAY PRODUCTION (with persistent volume mounted at /data):
//   Files → /data/uploads/<folder>/
//   DB    → /data/custom.db
//
// Railway automatically sets RAILWAY_VOLUME_MOUNT_DIR when a volume
// is attached. We use it to detect Railway and pick the right path.
// This keeps the app "zero-config" — just set the env var and it
// works on both local and Railway.
// =====================================================================

import path from "path";

/**
 * The root directory for persistent storage.
 * - On Railway (with volume): the volume mount path (default /data)
 * - Locally: the project root (process.cwd())
 */
export function getStorageRoot(): string {
  // Railway sets this automatically when a volume is mounted
  if (process.env.RAILWAY_VOLUME_MOUNT_DIR) {
    return process.env.RAILWAY_VOLUME_MOUNT_DIR;
  }
  // Fallback: allow manual override (e.g. for other platforms)
  if (process.env.STORAGE_DIR) {
    return process.env.STORAGE_DIR;
  }
  // Default: project root (local dev / sandbox)
  return process.cwd();
}

/**
 * Get the directory where uploaded files for a specific folder are stored.
 * e.g. getUploadDir("products") → /data/uploads/products (Railway)
 *                           or → /public/uploads/products (local)
 */
export function getUploadDir(folder: string): string {
  const root = getStorageRoot();
  // On Railway, uploads go in <volume>/uploads/<folder>/
  // Locally, uploads go in <cwd>/public/uploads/<folder>/
  if (process.env.RAILWAY_VOLUME_MOUNT_DIR || process.env.STORAGE_DIR) {
    return path.join(root, "uploads", folder);
  }
  return path.join(root, "public", "uploads", folder);
}

/**
 * Get the URL path for serving an uploaded file.
 * The image serving route (/api/uploads/[...path]) reads from the
 * physical upload dir, so the URL always uses /api/uploads/...
 * regardless of where the file is physically stored.
 *
 * e.g. getUploadUrl("products", "photo.png")
 *   → "/api/uploads/products/photo.png"
 */
export function getUploadUrl(folder: string, filename: string): string {
  return `/api/uploads/${folder}/${filename}`;
}

/**
 * Check if we're running in a production environment with
 * a persistent volume (Railway, Fly.io with volume, etc.)
 */
export function hasPersistentStorage(): boolean {
  return Boolean(
    process.env.RAILWAY_VOLUME_MOUNT_DIR || process.env.STORAGE_DIR
  );
}
