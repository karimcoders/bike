import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { uploadToCloudinary, isCloudinaryConfigured } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — this is a heavy migration

// =====================================================================
// POST /api/admin/migrate-photos
// ---------------------------------------------------------------------
// One-time migration: converts base64 data-URL photos stored in the DB
// to Cloudinary URLs.
//
// WHY: Old products (created before the Cloudinary upload fix) store
// photos as base64 data URLs directly in the `photo` column (4MB each!).
// This makes the dashboard API return 16MB+ responses and take 8+ seconds.
// After migration, each photo is a ~60 char Cloudinary URL.
//
// Also migrates Settings.logo and Settings.upiQrImage if they're base64.
//
// Safe to run multiple times — skips products whose photos are already
// Cloudinary URLs (or empty).
// =====================================================================

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

function hasBase64(photo: string | null | undefined): boolean {
  if (!photo) return false;
  return photo.includes("data:");
}

async function migratePhotoField(
  photo: string | null,
  folder: string
): Promise<string | null> {
  if (!photo) return null;
  if (!hasBase64(photo)) return photo;

  const tokenRegex = /data:[^,]*,[^,]*|[^,]+/g;
  const photos = (photo.match(tokenRegex) || []).map((s) => s.trim()).filter(Boolean);

  const migrated: string[] = [];
  for (const p of photos) {
    if (p.startsWith("data:")) {
      const parsed = parseDataUrl(p);
      if (parsed) {
        try {
          const url = await uploadToCloudinary(parsed.buffer, folder, parsed.mime);
          migrated.push(url);
        } catch {
          migrated.push(p);
        }
      }
    } else {
      migrated.push(p);
    }
  }
  return migrated.join(",");
}

export async function POST() {
  try {
    await requireUser();

    if (!isCloudinaryConfigured()) {
      return err(
        "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET first.",
        500
      );
    }

    const results = {
      productsScanned: 0,
      productsMigrated: 0,
      productsSkipped: 0,
      errors: [] as string[],
      settingsMigrated: false,
    };

    const products = await db.product.findMany({
      select: { id: true, name: true, photo: true },
    });
    results.productsScanned = products.length;

    for (const product of products) {
      if (!hasBase64(product.photo)) {
        results.productsSkipped++;
        continue;
      }
      try {
        const newPhoto = await migratePhotoField(product.photo, "products");
        if (newPhoto && newPhoto !== product.photo) {
          await db.product.update({
            where: { id: product.id },
            data: { photo: newPhoto },
          });
          results.productsMigrated++;
        }
      } catch (e: any) {
        results.errors.push(
          `Product "${product.name}" (${product.id}): ${e?.message || "unknown error"}`
        );
      }
    }

    const settings = await db.settings.findUnique({ where: { id: "singleton" } });
    if (settings) {
      let settingsChanged = false;
      const updateData: Record<string, string | null> = {};

      if (hasBase64(settings.logo)) {
        try {
          const newLogo = await migratePhotoField(settings.logo, "logos");
          if (newLogo && newLogo !== settings.logo) {
            updateData.logo = newLogo;
            settingsChanged = true;
          }
        } catch (e: any) {
          results.errors.push(`Settings logo: ${e?.message || "unknown error"}`);
        }
      }

      if (hasBase64(settings.upiQrImage)) {
        try {
          const newQr = await migratePhotoField(settings.upiQrImage, "qr");
          if (newQr && newQr !== settings.upiQrImage) {
            updateData.upiQrImage = newQr;
            settingsChanged = true;
          }
        } catch (e: any) {
          results.errors.push(`Settings QR: ${e?.message || "unknown error"}`);
        }
      }

      if (settingsChanged) {
        await db.settings.update({
          where: { id: "singleton" },
          data: updateData,
        });
        results.settingsMigrated = true;
      }
    }

    return ok({ results });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[migrate-photos] error:", e);
    return err("Migration failed", 500);
  }
}
