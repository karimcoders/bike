import { v2 as cloudinary } from "cloudinary";

// =====================================================================
// Cloudinary Upload Helper
// ---------------------------------------------------------------------
// Dual-mode file storage:
//   - If CLOUDINARY_CLOUD_NAME + API_KEY + API_SECRET are set → Cloudinary
//   - Otherwise → local filesystem (fallback for dev/sandbox)
//
// On Vercel (serverless, read-only filesystem), Cloudinary is REQUIRED
// for file uploads to work. On Railway/Render/local, local filesystem
// works fine and Cloudinary is optional.
//
// Env vars (get from https://cloudinary.com — free 25 credits/month):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
// =====================================================================

let _configured = false;

function ensureConfigured() {
  if (_configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  _configured = true;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Upload a file buffer to Cloudinary.
 * Returns the secure URL (https://res.cloudinary.com/...).
 *
 * @param fileBuffer - The file bytes
 * @param folder - Logical folder (products | logos | qr) — becomes bike-shop/<folder>
 * @param mimeType - MIME type (image/png, image/jpeg, etc.)
 * @returns Cloudinary secure URL
 */
export async function uploadToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  _mimeType: string
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
    );
  }

  ensureConfigured();

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `bike-shop/${folder}`,
        resource_type: "image",
        // Use unique public_id based on timestamp + random
        public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary returned no URL"));
          return;
        }
        resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}
