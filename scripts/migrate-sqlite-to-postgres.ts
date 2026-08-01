#!/usr/bin/env bun
// =====================================================================
// migrate-sqlite-to-postgres.ts
// =====================================================================
// Migrates ALL data from the old SQLite database to PostgreSQL.
//
// This is a ONE-TIME migration script. Run it after:
//   1. PostgreSQL is running and schema is pushed (db:push)
//   2. The old SQLite DB still exists at db/custom.db
//
// Usage (from project root):
//   env -u DATABASE_URL bun run scripts/migrate-sqlite-to-postgres.ts
//
// Or with explicit paths:
//   SQLITE_PATH=./db/custom.db \
//   DATABASE_URL=postgresql://postgres@localhost:5433/bikeshop \
//   bun run scripts/migrate-sqlite-to-postgres.ts
//
// The script:
//   - Reads all rows from each SQLite table (via better-sqlite3)
//   - Inserts them into PostgreSQL (via Prisma), preserving original IDs
//   - Coerces types (SQLite 0/1 → boolean, ISO strings → Date)
//   - Migrates in foreign-key order to satisfy constraints
//   - Reports per-table counts and a final verification
//
// Safe to re-run: clears PostgreSQL tables first (in reverse FK order).
// =====================================================================

import { Database } from "bun:sqlite";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";

const SQLITE_PATH =
  process.env.SQLITE_PATH || path.join(process.cwd(), "db", "custom.db");

// ---- Type coercion helpers ----
// SQLite stores booleans as 0/1 integers; PostgreSQL expects true/false.
// SQLite stores datetimes as ISO strings; PostgreSQL expects Date objects.
function coerce(
  row: Record<string, unknown>,
  boolFields: string[] = [],
  dateFields: string[] = []
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const f of boolFields) {
    if (out[f] !== null && out[f] !== undefined) {
      out[f] = Boolean(out[f]);
    }
  }
  for (const f of dateFields) {
    const v = out[f];
    if (v === null || v === undefined) continue;
    // Prisma's SQLite connector stores DateTime as epoch milliseconds (int).
    // Some older data may store ISO strings. Handle both.
    if (typeof v === "number") {
      out[f] = new Date(v);
    } else if (typeof v === "string") {
      out[f] = new Date(v);
    }
  }
  return out;
}

// Boolean + date fields per model (for type coercion)
const COERCION: Record<
  string,
  { bools: string[]; dates: string[] }
> = {
  User: { bools: ["active"], dates: ["createdAt"] },
  Category: { bools: [], dates: ["createdAt"] },
  Location: { bools: [], dates: ["createdAt"] },
  Settings: { bools: ["whatsappEnabled", "smsEnabled", "backupEnabled"], dates: [] },
  Product: { bools: [], dates: ["lastSoldAt", "createdAt", "updatedAt"] },
  Movement: { bools: [], dates: ["createdAt"] },
  Customer: { bools: [], dates: ["createdAt"] },
  Sale: { bools: [], dates: ["dueDate", "createdAt"] },
  SaleItem: { bools: [], dates: [] },
  LedgerEntry: { bools: [], dates: ["dueDate", "createdAt"] },
  ChatMessage: { bools: [], dates: ["createdAt"] },
};

// Migration order (parents before children, respecting FK constraints)
const MODELS: Array<{ model: string; table: string }> = [
  { model: "user", table: "User" },
  { model: "category", table: "Category" },
  { model: "location", table: "Location" },
  { model: "settings", table: "Settings" },
  { model: "customer", table: "Customer" },
  { model: "product", table: "Product" },
  { model: "movement", table: "Movement" },
  { model: "sale", table: "Sale" },
  { model: "saleItem", table: "SaleItem" },
  { model: "ledgerEntry", table: "LedgerEntry" },
  { model: "chatMessage", table: "ChatMessage" },
];

async function main() {
  // ---- Check SQLite source ----
  try {
    await fs.access(SQLITE_PATH);
  } catch {
    console.error(`\n✗ SQLite file not found: ${SQLITE_PATH}`);
    console.error(`  Set SQLITE_PATH env var to the correct path.`);
    process.exit(1);
  }

  console.log(`\n📖 Opening SQLite source: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  console.log(`🔌 Connecting to PostgreSQL (DATABASE_URL from env/.env)...\n`);
  const pg = new PrismaClient({ log: ["error", "warn"] });

  // Dynamic model accessor (avoids complex generic cast in loops)
  const M = (name: string): any => (pg as any)[name];

  // ---- Read all SQLite tables ----
  const readAll = (table: string): Record<string, unknown>[] => {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      return rows as unknown as Record<string, unknown>[];
    } catch {
      console.log(`  ⏭️  Table ${table} not found in SQLite, skipping`);
      return [];
    }
  };

  // ---- Clear existing PostgreSQL data (reverse FK order) ----
  console.log("🧹 Clearing existing PostgreSQL data...");
  for (const { model, table } of [...MODELS].reverse()) {
    try {
      await M(model).deleteMany();
      console.log(`  ✓ Cleared ${table}`);
    } catch (e) {
      console.log(`  ⏭️  Could not clear ${table}: ${(e as Error).message}`);
    }
  }

  // ---- Migrate each model ----
  console.log("\n🔄 Migrating data (SQLite → PostgreSQL)...\n");
  let totalMigrated = 0;
  let totalSource = 0;

  for (const { model, table } of MODELS) {
    const rows = readAll(table);
    totalSource += rows.length;
    if (rows.length === 0) {
      console.log(`  ℹ️  ${table}: 0 rows (nothing to migrate)`);
      continue;
    }

    const { bools, dates } = COERCION[table] || { bools: [], dates: [] };
    let count = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const data = coerce(row, bools, dates);
        await M(model).create({ data });
        count++;
      } catch (e) {
        errors++;
        if (errors <= 3) {
          console.error(`  ✗ ${table} row ${String(row.id || "?").slice(0, 12)}: ${(e as Error).message}`);
        }
      }
    }
    totalMigrated += count;
    const status = errors === 0 ? "✓" : `⚠️ (${errors} errors)`;
    console.log(`  ${status} ${table}: ${count}/${rows.length} rows migrated`);
  }

  // ---- Verification ----
  console.log("\n📊 PostgreSQL row counts (post-migration):");
  for (const { model, table } of MODELS) {
    try {
      const c = await M(model).count();
      console.log(`  ${table}: ${c}`);
    } catch {
      console.log(`  ${table}: <error>`);
    }
  }

  console.log(`\n✅ Migration complete! ${totalMigrated}/${totalSource} rows migrated.`);

  sqlite.close();
  await pg.$disconnect();
}

main().catch((e) => {
  console.error("\n✗ Migration failed:", e);
  process.exit(1);
});
