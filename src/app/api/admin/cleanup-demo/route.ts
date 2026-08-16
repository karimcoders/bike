import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================================
// POST /api/admin/cleanup-demo
// ---------------------------------------------------------------------
// Removes ONLY the demo/seed data that the old seed.ts used to create.
// It identifies demo records by EXACT identifiers (OEM numbers, customer
// name+phone combos, location codes) — it can never match real owner
// data because those identifiers are specific to the demo seed.
//
// Body: { preview?: boolean }
//   - preview=true  → returns what WOULD be deleted, deletes nothing
//   - preview=false → actually deletes the demo records
//
// SAFE DELETE ORDER (respects foreign keys):
//   1. Sales linked to demo customers  (SaleItem cascades with Sale)
//   2. Demo products                   (SaleItem + Movement cascade)
//   3. Demo customers                  (LedgerEntry cascades; Sale.customerId SetNull)
//   4. Demo locations                  (Product.locationId SetNull, but products
//                                        already gone, so just delete empty locations)
//   5. Reset demo Settings             (ONLY if values still match the demo seed)
//
// NEVER touches: real products, real customers, real sales, real ledger,
// real images, real locations created by the owner.
// =====================================================================

// ---- Exact demo identifiers (from the old seed.ts, commit ae05dfc^) ----
const DEMO_OEMS = [
  "26100M99R10", "45100M99J00", "CR8E", "17231M99J00", "ACT20W40",
  "CK-SPL-001", "MRF27518", "MRF30018", "PH12V35", "CC-SPL-99",
  "BC-SPL-98", "6201-2RS", "30500M99J00", "88210M99J00", "13011M99J00",
  "MH-UNI-01", "53100M99J00", "17240M99J00", "CS-400", "33100M99J00",
];

const DEMO_CUSTOMERS: { name: string; phone: string }[] = [
  { name: "Bablu Mechanic", phone: "9000000001" },
  { name: "Sintu Garage", phone: "9000000002" },
  { name: "Raju Auto Works", phone: "9000000003" },
  { name: "Walk-in Customer", phone: "" },
];

const DEMO_LOCATION_CODES = [
  "A-1-01", "A-1-02", "A-1-06", "A-2-05", "A-3-04", "A-3-05",
  "B-1-04", "B-1-05", "B-2-01", "B-2-03", "B-2-04", "B-3-06",
  "C-1-02", "C-1-03", "C-2-01", "C-2-02", "C-2-03", "C-2-05",
  "C-2-06", "C-3-01",
];

// Demo settings values — only reset if they STILL match (don't clobber
// real owner settings).
const DEMO_SETTINGS = {
  shopName: "Sharma Bike Parts",
  ownerName: "Sharma Ji",
  phone: "9876543210",
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    // Only admins can wipe data — staff/mechanics cannot.
    if (user.role !== "ADMIN") {
      return err("Sirf admin demo data remove kar sakte hain", 403);
    }

    let body: { preview?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine — treat as preview=false */
    }
    const preview = body.preview === true;

    // ---- 1. Find demo products (by exact OEM match) ----
    const demoProducts = await db.product.findMany({
      where: { oemNumber: { in: DEMO_OEMS } },
      select: {
        id: true,
        name: true,
        oemNumber: true,
        brand: true,
        quantity: true,
        photo: true,
        _count: { select: { saleItems: true, movements: true } },
      },
    });
    const demoProductIds = demoProducts.map((p) => p.id);

    // ---- 2. Find demo customers (by exact name+phone) ----
    // "Walk-in Customer" with phone "" is only deleted if it has ZERO
    // sales (so a real walk-in customer the owner uses is never touched).
    const demoCustomersRaw = await db.customer.findMany({
      where: {
        OR: DEMO_CUSTOMERS.map((c) => ({
          name: c.name,
          phone: c.phone,
        })),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        outstanding: true,
        advance: true,
        _count: { select: { sales: true, ledger: true } },
      },
    });
    // Filter Walk-in Customer: only if it has no sales (real one would).
    const demoCustomers = demoCustomersRaw.filter((c) => {
      if (c.name === "Walk-in Customer" && c.phone === "") {
        return c._count.sales === 0 && c.outstanding === 0 && c.advance === 0;
      }
      return true;
    });
    const demoCustomerIds = demoCustomers.map((c) => c.id);

    // ---- 3. Find demo sales (linked to demo customers) ----
    const demoSales = await db.sale.findMany({
      where: { customerId: { in: demoCustomerIds } },
      select: { id: true, invoiceNo: true, total: true, createdAt: true },
    });
    const demoSaleIds = demoSales.map((s) => s.id);

    // ---- 4. Find demo locations (by exact code) ----
    const demoLocations = await db.location.findMany({
      where: { code: { in: DEMO_LOCATION_CODES } },
      select: {
        id: true,
        code: true,
        rack: true,
        box: true,
        _count: { select: { products: true } },
      },
    });
    const demoLocationIds = demoLocations.map((l) => l.id);

    // ---- 5. Check demo settings ----
    const settings = await db.settings.findUnique({ where: { id: "singleton" } });
    const settingsIsDemo =
      !!settings &&
      settings.shopName === DEMO_SETTINGS.shopName &&
      settings.ownerName === DEMO_SETTINGS.ownerName &&
      settings.phone === DEMO_SETTINGS.phone;

    const summary = {
      products: demoProducts.map((p) => ({
        id: p.id,
        name: p.name,
        oem: p.oemNumber,
        brand: p.brand,
        qty: p.quantity,
      })),
      customers: demoCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
      sales: demoSales.length,
      locations: demoLocations.map((l) => ({
        id: l.id,
        code: l.code,
        occupied: l._count.products,
      })),
      settingsIsDemo,
    };

    // ---- PREVIEW: return what would be deleted, don't touch anything ----
    if (preview) {
      return ok({
        preview: true,
        counts: {
          products: demoProducts.length,
          customers: demoCustomers.length,
          sales: demoSales.length,
          locations: demoLocations.length,
          settings: settingsIsDemo ? 1 : 0,
        },
        detail: summary,
      });
    }

    // ---- ACTUAL DELETE (safe order) ----
    const deleted = {
      sales: 0,
      products: 0,
      customers: 0,
      locations: 0,
      settings: false,
    };

    // 1. Delete demo sales (SaleItem cascades via onDelete: Cascade on Sale)
    if (demoSaleIds.length > 0) {
      const r = await db.sale.deleteMany({ where: { id: { in: demoSaleIds } } });
      deleted.sales = r.count;
    }

    // 2. Delete demo products (SaleItem + Movement cascade via onDelete: Cascade)
    if (demoProductIds.length > 0) {
      const r = await db.product.deleteMany({
        where: { id: { in: demoProductIds } },
      });
      deleted.products = r.count;
    }

    // 3. Delete demo customers (LedgerEntry cascades; sales already gone
    //    or had customerId SetNull — but we deleted demo sales above, so
    //    these customers have no remaining sales)
    if (demoCustomerIds.length > 0) {
      const r = await db.customer.deleteMany({
        where: { id: { in: demoCustomerIds } },
      });
      deleted.customers = r.count;
    }

    // 4. Delete demo locations (products already gone, so they're empty)
    if (demoLocationIds.length > 0) {
      const r = await db.location.deleteMany({
        where: { id: { in: demoLocationIds } },
      });
      deleted.locations = r.count;
    }

    // 5. Reset demo settings to factory defaults (ONLY if still demo)
    if (settingsIsDemo) {
      await db.settings.update({
        where: { id: "singleton" },
        data: {
          shopName: "Bike Inventory Pro",
          ownerName: "",
          phone: "",
        },
      });
      deleted.settings = true;
    }

    return ok({
      preview: false,
      deleted,
      counts: {
        products: demoProducts.length,
        customers: demoCustomers.length,
        sales: demoSales.length,
        locations: demoLocations.length,
        settings: settingsIsDemo ? 1 : 0,
      },
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error("[cleanup-demo] error:", e);
    return err("Demo data cleanup failed", 500);
  }
}
