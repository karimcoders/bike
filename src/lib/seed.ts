import { db } from "./db";
import { hashPassword } from "./auth";

// =====================================================================
// Database Seed Logic (exportable for API route + CLI script)
// ---------------------------------------------------------------------
// This file is imported by:
//   - prisma/seed.ts  (CLI: bun run prisma/seed.ts)
//   - src/app/api/init/route.ts (POST /api/init — for Vercel first-deploy)
//
// The seed is IDEMPOTENT — uses upsert/findFirst, safe to run multiple times.
//
// PRODUCTION DEFAULT = CLEAN SHOP
// --------------------------------
// A first-time real shop owner must see an EMPTY shop:
//   0 Products · 0 Customers · 0 Sales · 0 Locations · ₹0 Stock Value
// The owner adds their own products, customers, and locations.
//
// We only seed what a real shop cannot function without:
//   - Login accounts (admin/staff)
//   - A starter set of categories (taxonomy — not demo inventory)
//   - A bare Settings singleton (schema defaults, no fake shop name)
//
// Demo products/sales/customers are NOT seeded by default. If you need
// demo data for a presentation, call runDemoSeed() explicitly instead.
// =====================================================================

const STARTER_CATEGORIES = [
  { name: "Engine", icon: "Cog", color: "#f97316" },
  { name: "Brake", icon: "Disc3", color: "#ef4444" },
  { name: "Electrical", icon: "Zap", color: "#eab308" },
  { name: "Tyre", icon: "Circle", color: "#1f2937" },
  { name: "Oil", icon: "Droplet", color: "#10b981" },
  { name: "Chain Kit", icon: "Link", color: "#8b5cf6" },
  { name: "Body Parts", icon: "Bike", color: "#06b6d4" },
  { name: "Accessories", icon: "Package", color: "#ec4899" },
  { name: "Bearings", icon: "CircleDot", color: "#64748b" },
  { name: "Cables", icon: "Cable", color: "#f59e0b" },
  { name: "Filters", icon: "Filter", color: "#14b8a6" },
];

export async function runSeed() {
  console.log("🌱 Seeding database (clean production default)...");

  // ---- Users (login accounts) ----
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashPassword("admin123"),
      name: "Shop Owner",
      role: "ADMIN",
    },
  });

  await db.user.upsert({
    where: { username: "staff" },
    update: {},
    create: {
      username: "staff",
      password: hashPassword("staff123"),
      name: "Staff",
      role: "STAFF",
    },
  });

  // ---- Categories (starter taxonomy — NOT demo inventory) ----
  // A real shop owner benefits from a standard set of categories to
  // classify bike parts. They can rename, add, or delete these freely.
  for (const c of STARTER_CATEGORIES) {
    await db.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }

  // ---- Settings singleton (bare — schema defaults apply) ----
  // We intentionally do NOT seed a fake shop name/owner/address/phone.
  // The owner fills these in via Settings. The schema defaults give a
  // usable placeholder ("Bike Inventory Pro") until they customize it.
  await db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  // NOTE: We deliberately do NOT seed:
  //   - Locations   → owner sets up their own boxes (simple/rack flow)
  //   - Products    → owner adds real products
  //   - Customers   → owner adds real customers
  //   - Sales       → none until the owner makes a real sale
  //
  // This keeps the production app genuinely empty on first run, so the
  // owner is never confused by fake data that isn't theirs.

  console.log("✅ Seed complete (clean shop — no demo data).");
  console.log("   Admin login:  admin / admin123");
  console.log("   Staff login:  staff / staff123");
  console.log(`   Users: 2 | Categories: ${STARTER_CATEGORIES.length} | Products: 0 | Customers: 0 | Sales: 0 | Locations: 0`);
  return admin;
}
