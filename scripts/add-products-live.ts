// Add a batch of realistic bike spare-parts products to the LIVE site.
// Usage:  bun run scripts/add-products-live.ts
//
// Reads the session cookie from $LIVE_COOKIE env var (or arg).
// Hits https://saranbike.vercel.app/api/products for each product.

const BASE = "https://saranbike.vercel.app";
const COOKIE = process.env.LIVE_COOKIE || process.argv[2];
if (!COOKIE) {
  console.error("Missing session cookie. Set LIVE_COOKIE env or pass as arg.");
  process.exit(1);
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Cookie: COOKIE.startsWith("bip_session=") ? COOKIE : `bip_session=${COOKIE}`,
};

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: r.status, json, text };
}

// ---- Products to add (realistic rural Bihar bike parts shop inventory) ----
type NewProduct = {
  name: string;
  bikeModels: string;
  brand: string;
  oemNumber: string;
  category: string; // category name
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  supplier: string;
  notes: string;
};

const products: NewProduct[] = [
  { name: "Rear Brake Shoe Set", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Brembo", oemNumber: "45200M99J00", category: "Brake", purchasePrice: 95, sellingPrice: 150, quantity: 10, minStock: 6, supplier: "Rajesh Auto Supply", notes: "Rear wheel" },
  { name: "Clutch Lever (Left)", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Hero OEM", oemNumber: "53101M99J00", category: "Body Parts", purchasePrice: 48, sellingPrice: 90, quantity: 12, minStock: 5, supplier: "Hero Distributors", notes: "" },
  { name: "Speedometer Cable", bikeModels: "Splendor+,Passion Pro", brand: "Suprob", oemNumber: "SC-SPL-97", category: "Cables", purchasePrice: 35, sellingPrice: 70, quantity: 14, minStock: 8, supplier: "Rajesh Auto Supply", notes: "" },
  { name: "Self Motor (Self Start)", bikeModels: "Splendor+,Passion Pro", brand: "Hero OEM", oemNumber: "31200M99J00", category: "Electrical", purchasePrice: 480, sellingPrice: 680, quantity: 3, minStock: 2, supplier: "Hero Distributors", notes: "12V" },
  { name: "Rectifier / Regulator", bikeModels: "Splendor+,HF Deluxe", brand: "Hero OEM", oemNumber: "31600M99J00", category: "Electrical", purchasePrice: 140, sellingPrice: 220, quantity: 6, minStock: 3, supplier: "Hero Distributors", notes: "" },
  { name: "Headlight Bulb 12V 60/55W", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Philips", oemNumber: "PH12V6055", category: "Electrical", purchasePrice: 45, sellingPrice: 85, quantity: 25, minStock: 10, supplier: "Philips India", notes: "HS1 halogen" },
  { name: "Indicator Bulb 12V 10W", bikeModels: "Universal", brand: "Philips", oemNumber: "PH12V10", category: "Electrical", purchasePrice: 12, sellingPrice: 25, quantity: 50, minStock: 20, supplier: "Philips India", notes: "Ba15s base" },
  { name: "Rear Shock Absorber (Pair)", bikeModels: "Splendor+", brand: "Hero OEM", oemNumber: "52400M99J00", category: "Body Parts", purchasePrice: 420, sellingPrice: 620, quantity: 4, minStock: 2, supplier: "Hero Distributors", notes: "Set of 2" },
  { name: "Front Fork Oil Seal", bikeModels: "Splendor+,HF Deluxe", brand: "SKF", oemNumber: "FS-SPL-35", category: "Bearings", purchasePrice: 60, sellingPrice: 110, quantity: 8, minStock: 4, supplier: "SKF India", notes: "35mm" },
  { name: "Valve Set (Inlet+Outlet)", bikeModels: "Splendor+", brand: "Hero OEM", oemNumber: "14721M99J00", category: "Engine", purchasePrice: 180, sellingPrice: 280, quantity: 5, minStock: 3, supplier: "Hero Distributors", notes: "2+2 pcs" },
  { name: "Carburetor Repair Kit", bikeModels: "Splendor+,Passion Pro", brand: "Hero OEM", oemNumber: "CRK-SPL-01", category: "Engine", purchasePrice: 90, sellingPrice: 160, quantity: 7, minStock: 3, supplier: "Hero Distributors", notes: "Float + gaskets" },
  { name: "Engine Oil 1L (15W50)", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Motul", oemNumber: "MT15W50", category: "Oil", purchasePrice: 240, sellingPrice: 320, quantity: 15, minStock: 6, supplier: "Motul India", notes: "Semi-synthetic" },
  { name: "Grease 500g", bikeModels: "Universal", brand: "Castrol", oemNumber: "CG500", category: "Oil", purchasePrice: 110, sellingPrice: 170, quantity: 9, minStock: 4, supplier: "Castrol Distributor", notes: "NLGI 3" },
  { name: "Brake Fluid 100ml DOT3", bikeModels: "Universal", brand: "Castrol", oemNumber: "BF100DOT3", category: "Oil", purchasePrice: 70, sellingPrice: 120, quantity: 11, minStock: 5, supplier: "Castrol Distributor", notes: "" },
  { name: "Rear Tyre 2.75-18", bikeModels: "HF Deluxe,CD Deluxe", brand: "MRF", oemNumber: "MRF27518R", category: "Tyre", purchasePrice: 980, sellingPrice: 1300, quantity: 5, minStock: 3, supplier: "MRF Dealer", notes: "Tube type" },
  { name: "Tyre Tube 2.75/3.00-18", bikeModels: "Universal", brand: "Ralson", oemNumber: "RT18", category: "Tyre", purchasePrice: 90, sellingPrice: 150, quantity: 18, minStock: 8, supplier: "Ralson Dealer", notes: "Butyl rubber" },
  { name: "Air Filter (Sport)", bikeModels: "Passion Pro", brand: "Hero OEM", oemNumber: "17231PP100", category: "Filters", purchasePrice: 42, sellingPrice: 80, quantity: 9, minStock: 6, supplier: "Hero Distributors", notes: "" },
  { name: "Fuel Tap (Petcock)", bikeModels: "Splendor+,HF Deluxe", brand: "Hero OEM", oemNumber: "16950M99J00", category: "Engine", purchasePrice: 65, sellingPrice: 120, quantity: 6, minStock: 3, supplier: "Hero Distributors", notes: "" },
  { name: "Horn Set (Dual Tone)", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Bosch", oemNumber: "BH-DT-01", category: "Electrical", purchasePrice: 130, sellingPrice: 210, quantity: 7, minStock: 3, supplier: "Bosch India", notes: "12V pair" },
  { name: "Side Mirror (Left)", bikeModels: "Splendor+,HF Deluxe", brand: "Hero OEM", oemNumber: "88211M99J00", category: "Body Parts", purchasePrice: 70, sellingPrice: 130, quantity: 13, minStock: 6, supplier: "Hero Distributors", notes: "" },
  { name: "Seat Cover (Splendor)", bikeModels: "Splendor+", brand: "Generic", oemNumber: "SC-SPL-01", category: "Accessories", purchasePrice: 80, sellingPrice: 180, quantity: 10, minStock: 4, supplier: "Local Wholesale", notes: "Waterproof" },
  { name: "Bike Cover (Waterproof)", bikeModels: "Universal", brand: "Generic", oemNumber: "BC-UNI-01", category: "Accessories", purchasePrice: 90, sellingPrice: 220, quantity: 8, minStock: 4, supplier: "Local Wholesale", notes: "All-weather" },
  { name: "Chain Link Set (Rolon)", bikeModels: "Splendor+,HF Deluxe", brand: "Rolon", oemNumber: "CL-SPL-02", category: "Chain Kit", purchasePrice: 140, sellingPrice: 230, quantity: 6, minStock: 3, supplier: "Rolon India", notes: "With clip" },
  { name: "Front Mudguard", bikeModels: "Splendor+", brand: "Hero OEM", oemNumber: "83500M99J00", category: "Body Parts", purchasePrice: 160, sellingPrice: 260, quantity: 4, minStock: 2, supplier: "Hero Distributors", notes: "" },
  { name: "Battery 12V 4Ah", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Exide", oemNumber: "EX12V4A", category: "Electrical", purchasePrice: 360, sellingPrice: 520, quantity: 6, minStock: 3, supplier: "Exide Dealer", notes: "MF battery" },
];

async function main() {
  console.log("Fetching categories + locations...");
  const [{ categories }, { locations }] = await Promise.all([
    get("/api/categories"),
    get("/api/locations"),
  ]);
  const catId: Record<string, string> = {};
  for (const c of categories) catId[c.name] = c.id;

  // Empty locations = no product currently assigned
  const emptyLocs = locations.filter((l: any) => !l.products || l.products.length === 0);
  console.log(`Empty locations available: ${emptyLocs.length}`);

  let added = 0;
  let failed = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const categoryId = catId[p.category];
    if (!categoryId) {
      console.error(`[${i + 1}] SKIP ${p.name}: category "${p.category}" not found`);
      failed++;
      continue;
    }
    const loc = emptyLocs[i]; // assign a unique empty location
    const body: Record<string, unknown> = {
      name: p.name,
      bikeModels: p.bikeModels,
      brand: p.brand,
      oemNumber: p.oemNumber,
      categoryId,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      quantity: p.quantity,
      minStock: p.minStock,
      supplier: p.supplier,
      notes: p.notes,
    };
    if (loc) body.locationId = loc.id;

    const res = await post("/api/products", body);
    if (res.status === 201) {
      added++;
      console.log(`[${i + 1}/${products.length}] ✅ ${p.name}  (loc ${loc?.code || "none"})`);
    } else {
      failed++;
      console.error(`[${i + 1}/${products.length}] ❌ ${p.name} -> ${res.status}: ${res.text.slice(0, 200)}`);
    }
    // small delay to be gentle
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n=== Done. Added: ${added}, Failed: ${failed} ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
