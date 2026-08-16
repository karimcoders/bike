import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/admin/wipe-business
// ---------------------------------------------------------------------
// COMPLETE business-data reset. The owner asked for a FRESH shop:
// remove every product, customer, sale, ledger, movement, location and
// chat message — and reset the shop Settings to factory-empty defaults.
//
// WHAT IS PRESERVED:
//   - User accounts (admin + staff logins still work)
//   - Categories (system taxonomy)
//   - Database schema / migrations
//
// WHAT IS WIPED:
//   - SaleItem, Sale, LedgerEntry, Movement, Product, Customer,
//     Location, ChatMessage
//   - Settings reset to empty shop name / no logo / no UPI / no QR.
//
// SAFE DELETE ORDER (respects foreign keys declared in schema.prisma):
//   1. SaleItem    (FK -> Sale, cascade)
//   2. LedgerEntry (FK -> Customer, cascade)
//   3. Sale        (after SaleItem gone)
//   4. Movement    (FK -> Product, cascade)
//   5. Product     (after Movement gone; locationId SetNull on Location delete)
//   6. Customer    (after LedgerEntry gone)
//   7. Location    (after Product gone -- and Product.locationId is SetNull)
//   8. ChatMessage (FK -> User, cascade -- but we KEEP users, so just wipe rows)
//   9. Settings    -> update singleton to factory defaults
//
// Body: { confirm?: "WIPE" }   (optional safety token; if missing, still
//                              works -- admin auth is the real gate)
// Returns: { wiped: {...counts}, remaining: {...counts}, settings: {...} }
// =====================================================================

// Factory-default settings. These match what a brand-new owner would see
// before entering their own shop info -- empty strings, no logo, no UPI.
const FACTORY_SETTINGS = {
  shopName: "",
  ownerName: "",
  address: "",
  phone: "",
  logo: null,
  upiId: null,
  upiQrImage: null,
  upiApps: "",
  gstNumber: null,
};

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();

    // Optional confirmation token -- purely defensive. The real gate is
    // requireAdmin() above (only ADMIN role can call this).
    let body: { confirm?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine */
    }
    if (body.confirm && body.confirm !== "WIPE") {
      return err("Confirmation token mismatch");
    }

    // Run all deletions in a transaction so we never end up in a
    // half-wiped state if one query fails. Neon supports interactive
    // transactions; this is a small number of deleteMany calls so the
    // transaction will complete well within the default timeout.
    const result = await db.$transaction(async (tx) => {
      // 1. SaleItem
      const saleItems = await tx.saleItem.deleteMany({});

      // 2. LedgerEntry
      const ledger = await tx.ledgerEntry.deleteMany({});

      // 3. Sale (now safe -- no SaleItems left to reference them)
      const sales = await tx.sale.deleteMany({});

      // 4. Movement
      const movements = await tx.movement.deleteMany({});

      // 5. Product (now safe -- no Movements left)
      const products = await tx.product.deleteMany({});

      // 6. Customer (now safe -- no LedgerEntries left)
      const customers = await tx.customer.deleteMany({});

      // 7. Location (now safe -- Products gone, and even if any remained
      //    Product.locationId is onDelete: SetNull, not Restrict)
      const locations = await tx.location.deleteMany({});

      // 8. ChatMessage (assistant history -- independent of business data)
      const chats = await tx.chatMessage.deleteMany({});

      // 9. Settings -- reset to factory-empty defaults.
      //    We use upsert in case the singleton row doesn't exist yet
      //    (paranoia; it should always exist after init).
      await tx.settings.upsert({
        where: { id: "singleton" },
        update: FACTORY_SETTINGS,
        create: { id: "singleton", ...FACTORY_SETTINGS },
      });

      return {
        saleItems: saleItems.count,
        ledgerEntries: ledger.count,
        sales: sales.count,
        movements: movements.count,
        products: products.count,
        customers: customers.count,
        locations: locations.count,
        chatMessages: chats.count,
      };
    });

    // Re-query the actual remaining counts so the response is a source of
    // truth the UI / Agent Browser can verify against.
    const remaining = {
      products: await db.product.count(),
      customers: await db.customer.count(),
      sales: await db.sale.count(),
      saleItems: await db.saleItem.count(),
      ledgerEntries: await db.ledgerEntry.count(),
      movements: await db.movement.count(),
      locations: await db.location.count(),
      chatMessages: await db.chatMessage.count(),
      users: await db.user.count(), // must stay > 0 (admin preserved)
      categories: await db.category.count(), // preserved
    };

    // Touch the settings row to confirm it's now factory-default.
    const settings = await db.settings.findUnique({
      where: { id: "singleton" },
      select: {
        shopName: true,
        ownerName: true,
        phone: true,
        logo: true,
        upiId: true,
        upiQrImage: true,
      },
    });

    return ok({
      wiped: result,
      remaining,
      settings,
      triggeredBy: { id: user.id, username: user.username, role: user.role },
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[wipe-business] error:", e);
    return err("Business data wipe failed", 500);
  }
}
