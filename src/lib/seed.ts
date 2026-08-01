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
// =====================================================================

export async function runSeed() {
  console.log("🌱 Seeding database...");

  // ---- Users ----
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

  const staff = await db.user.upsert({
    where: { username: "staff" },
    update: {},
    create: {
      username: "staff",
      password: hashPassword("staff123"),
      name: "Ramesh (Staff)",
      role: "STAFF",
    },
  });

  // ---- Categories ----
  const categoryData = [
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
  const categories: Record<string, string> = {};
  for (const c of categoryData) {
    const cat = await db.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    categories[c.name] = cat.id;
  }

  // ---- Locations: Rack A,B,C with 3 rows x 6 boxes each ----
  const racks = ["A", "B", "C"];
  const locationIds: Record<string, string> = {};
  for (const rack of racks) {
    for (let row = 1; row <= 3; row++) {
      for (let box = 1; box <= 6; box++) {
        const code = `${rack}-${row}-${String(box).padStart(2, "0")}`;
        const loc = await db.location.upsert({
          where: { code },
          update: {},
          create: { code, rack, row, box },
        });
        locationIds[code] = loc.id;
      }
    }
  }

  // ---- Sample products (realistic bike parts) ----
  const products = [
    { name: "Clutch Plate Set", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Hero OEM", oemNumber: "26100M99R10", category: "Engine", location: "A-1-01", purchasePrice: 180, sellingPrice: 250, quantity: 12, minStock: 5, supplier: "Hero Distributors", notes: "3-plate set" },
    { name: "Brake Shoe Set (Front)", bikeModels: "Splendor+,Passion Pro", brand: "Brembo", oemNumber: "45100M99J00", category: "Brake", location: "A-1-02", purchasePrice: 90, sellingPrice: 140, quantity: 8, minStock: 6, supplier: "Rajesh Auto Supply", notes: "" },
    { name: "Spark Plug", bikeModels: "Splendor+,HF Deluxe,CD Deluxe", brand: "NGK", oemNumber: "CR8E", category: "Electrical", location: "B-2-03", purchasePrice: 55, sellingPrice: 90, quantity: 30, minStock: 10, supplier: "NGK India", notes: "Iridium option available" },
    { name: "Air Filter", bikeModels: "Splendor+,Passion Pro", brand: "Hero OEM", oemNumber: "17231M99J00", category: "Filters", location: "B-1-04", purchasePrice: 35, sellingPrice: 70, quantity: 4, minStock: 8, supplier: "Hero Distributors", notes: "" },
    { name: "Engine Oil 1L (20W40)", bikeModels: "Splendor+,HF Deluxe,Passion Pro,CD Deluxe", brand: "Castrol", oemNumber: "ACT20W40", category: "Oil", location: "C-3-01", purchasePrice: 180, sellingPrice: 240, quantity: 18, minStock: 6, supplier: "Castrol Distributor", notes: "Mineral oil" },
    { name: "Chain Kit", bikeModels: "Splendor+", brand: "Rolon", oemNumber: "CK-SPL-001", category: "Chain Kit", location: "A-2-05", purchasePrice: 320, sellingPrice: 450, quantity: 0, minStock: 3, supplier: "Rolon India", notes: "Chain + sprocket set" },
    { name: "Front Tyre 2.75-18", bikeModels: "Splendor+,HF Deluxe", brand: "MRF", oemNumber: "MRF27518", category: "Tyre", location: "C-1-02", purchasePrice: 950, sellingPrice: 1250, quantity: 6, minStock: 4, supplier: "MRF Dealer", notes: "Tube type" },
    { name: "Rear Tyre 3.00-18", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "MRF", oemNumber: "MRF30018", category: "Tyre", location: "C-1-03", purchasePrice: 1100, sellingPrice: 1450, quantity: 5, minStock: 4, supplier: "MRF Dealer", notes: "Tube type" },
    { name: "Headlight Bulb 12V 35W", bikeModels: "Splendor+,HF Deluxe,Passion Pro,CD Deluxe", brand: "Philips", oemNumber: "PH12V35", category: "Electrical", location: "B-2-01", purchasePrice: 25, sellingPrice: 50, quantity: 40, minStock: 15, supplier: "Philips India", notes: "HS1 type" },
    { name: "Clutch Cable", bikeModels: "Splendor+,Passion Pro", brand: "Suprob", oemNumber: "CC-SPL-99", category: "Cables", location: "A-3-04", purchasePrice: 40, sellingPrice: 80, quantity: 3, minStock: 8, supplier: "Rajesh Auto Supply", notes: "" },
    { name: "Brake Cable (Front)", bikeModels: "Splendor+,HF Deluxe", brand: "Suprob", oemNumber: "BC-SPL-98", category: "Cables", location: "A-3-05", purchasePrice: 38, sellingPrice: 75, quantity: 9, minStock: 8, supplier: "Rajesh Auto Supply", notes: "" },
    { name: "Wheel Bearing (Front)", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "SKF", oemNumber: "6201-2RS", category: "Bearings", location: "B-3-06", purchasePrice: 45, sellingPrice: 85, quantity: 22, minStock: 10, supplier: "SKF India", notes: "2 pcs per wheel" },
    { name: "Inductor Coil", bikeModels: "Splendor+,Passion Pro", brand: "Hero OEM", oemNumber: "30500M99J00", category: "Electrical", location: "B-2-04", purchasePrice: 220, sellingPrice: 320, quantity: 7, minStock: 5, supplier: "Hero Distributors", notes: "" },
    { name: "Side Mirror (Right)", bikeModels: "Splendor+,HF Deluxe", brand: "Hero OEM", oemNumber: "88210M99J00", category: "Body Parts", location: "C-2-01", purchasePrice: 70, sellingPrice: 130, quantity: 14, minStock: 6, supplier: "Hero Distributors", notes: "" },
    { name: "Piston Ring Set", bikeModels: "Splendor+", brand: "Hero OEM", oemNumber: "13011M99J00", category: "Engine", location: "A-1-06", purchasePrice: 150, sellingPrice: 230, quantity: 2, minStock: 5, supplier: "Hero Distributors", notes: "Std size" },
    { name: "Mobile Holder", bikeModels: "Universal", brand: "Generic", oemNumber: "MH-UNI-01", category: "Accessories", location: "C-2-06", purchasePrice: 60, sellingPrice: 150, quantity: 11, minStock: 5, supplier: "Local Wholesale", notes: "Adjustable grip" },
    { name: "Brake Lever (Right)", bikeModels: "Splendor+,HF Deluxe,Passion Pro", brand: "Hero OEM", oemNumber: "53100M99J00", category: "Body Parts", location: "C-2-02", purchasePrice: 50, sellingPrice: 95, quantity: 10, minStock: 5, supplier: "Hero Distributors", notes: "" },
    { name: "Oil Filter", bikeModels: "Splendor+,HF Deluxe", brand: "Hero OEM", oemNumber: "17240M99J00", category: "Filters", location: "B-1-05", purchasePrice: 30, sellingPrice: 60, quantity: 2, minStock: 8, supplier: "Hero Distributors", notes: "" },
    { name: "Chain Spray", bikeModels: "Universal", brand: "Motul", oemNumber: "CS-400", category: "Accessories", location: "C-2-05", purchasePrice: 180, sellingPrice: 280, quantity: 9, minStock: 4, supplier: "Motul India", notes: "400ml" },
    { name: "Headlight Assembly", bikeModels: "Splendor+", brand: "Hero OEM", oemNumber: "33100M99J00", category: "Body Parts", location: "C-2-03", purchasePrice: 380, sellingPrice: 550, quantity: 4, minStock: 3, supplier: "Hero Distributors", notes: "" },
  ];

  const productIds: { id: string; name: string; purchasePrice: number; sellingPrice: number; quantity: number }[] = [];

  for (const p of products) {
    const existing = await db.product.findFirst({
      where: { name: p.name, oemNumber: p.oemNumber },
    });
    if (existing) {
      await db.product.update({
        where: { id: existing.id },
        data: {
          bikeModels: p.bikeModels,
          brand: p.brand,
          oemNumber: p.oemNumber,
          categoryId: categories[p.category],
          locationId: locationIds[p.location],
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          quantity: p.quantity,
          minStock: p.minStock,
          supplier: p.supplier,
          notes: p.notes,
        },
      });
      const movExisting = await db.movement.findFirst({
        where: { productId: existing.id, type: "ADDED", reason: "Initial stock" },
      });
      if (!movExisting) {
        await db.movement.create({
          data: { productId: existing.id, type: "ADDED", quantity: p.quantity, reason: "Initial stock", note: "Seeded data", userId: admin.id },
        });
      }
      productIds.push({ id: existing.id, name: p.name, purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: p.quantity });
    } else {
      const product = await db.product.create({
        data: {
          name: p.name, bikeModels: p.bikeModels, brand: p.brand, oemNumber: p.oemNumber,
          categoryId: categories[p.category], locationId: locationIds[p.location],
          purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: p.quantity,
          minStock: p.minStock, supplier: p.supplier, notes: p.notes,
        },
      });
      await db.movement.create({
        data: { productId: product.id, type: "ADDED", quantity: p.quantity, reason: "Initial stock", note: "Seeded data", userId: admin.id },
      });
      productIds.push({ id: product.id, name: p.name, purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, quantity: p.quantity });
    }
  }

  // ---- Customers (mechanics) ----
  const customerData = [
    { name: "Bablu Mechanic", phone: "9000000001", type: "MECHANIC", notes: "Regular customer, buys engine parts" },
    { name: "Sintu Garage", phone: "9000000002", type: "MECHANIC", notes: "Bulk buyer" },
    { name: "Raju Auto Works", phone: "9000000003", type: "MECHANIC", notes: "" },
    { name: "Walk-in Customer", phone: "", type: "RETAIL", notes: "General retail" },
  ];
  const customers: Record<string, string> = {};
  for (const c of customerData) {
    const existing = await db.customer.findFirst({ where: { name: c.name } });
    const cust = existing || await db.customer.create({ data: c });
    customers[c.name] = cust.id;
  }

  // ---- Sample Sales over last 25 days (for AI insights) ----
  const existingSales = await db.sale.count();
  if (existingSales === 0) {
    console.log("   Generating sample sales history...");
    // Weighted product selection: some products sell more
    const hotProducts = productIds.filter((p) =>
      ["Spark Plug", "Engine Oil 1L (20W40)", "Headlight Bulb 12V 35W", "Brake Shoe Set (Front)", "Air Filter", "Clutch Cable", "Wheel Bearing (Front)"].includes(p.name)
    );
    const normalProducts = productIds.filter((p) =>
      ["Clutch Plate Set", "Brake Cable (Front)", "Side Mirror (Right)", "Chain Spray", "Brake Lever (Right)", "Oil Filter", "Inductor Coil"].includes(p.name)
    );
    const rareProducts = productIds.filter((p) =>
      ["Front Tyre 2.75-18", "Rear Tyre 3.00-18", "Headlight Assembly", "Piston Ring Set", "Mobile Holder"].includes(p.name)
    );
    const custKeys = Object.keys(customers);
    let invCounter = 1001;

    for (let dayAgo = 24; dayAgo >= 0; dayAgo--) {
      const day = new Date(Date.now() - dayAgo * 86400000);
      // 2-6 sales per day, more on recent days
      const salesCount = 2 + Math.floor(Math.random() * 4) + (dayAgo < 5 ? 1 : 0);
      for (let s = 0; s < salesCount; s++) {
        // time during the day 9am-8pm
        const saleDate = new Date(day);
        saleDate.setHours(9 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60));
        // pick 1-3 items
        const itemCount = 1 + Math.floor(Math.random() * 3);
        const items: { product: typeof productIds[number]; qty: number }[] = [];
        for (let i = 0; i < itemCount; i++) {
          const r = Math.random();
          let pool = hotProducts;
          if (r > 0.55 && r < 0.85) pool = normalProducts;
          else if (r >= 0.85) pool = rareProducts;
          if (pool.length === 0) continue;
          const prod = pool[Math.floor(Math.random() * pool.length)];
          const qty = 1 + Math.floor(Math.random() * 3);
          items.push({ product: prod, qty });
        }
        if (items.length === 0) continue;
        let total = 0;
        let profit = 0;
        for (const it of items) {
          total += it.product.sellingPrice * it.qty;
          profit += (it.product.sellingPrice - it.product.purchasePrice) * it.qty;
        }
        const custName = custKeys[Math.floor(Math.random() * custKeys.length)];
        const sale = await db.sale.create({
          data: {
            invoiceNo: `INV-${invCounter++}`,
            customerId: customers[custName],
            userId: Math.random() > 0.5 ? admin.id : staff.id,
            total,
            profit,
            itemCount: items.length,
            createdAt: saleDate,
          },
        });
        for (const it of items) {
          await db.saleItem.create({
            data: {
              saleId: sale.id,
              productId: it.product.id,
              name: it.product.name,
              price: it.product.sellingPrice,
              purchasePrice: it.product.purchasePrice,
              quantity: it.qty,
              subtotal: it.product.sellingPrice * it.qty,
            },
          });
          // update lastSoldAt
          await db.product.update({
            where: { id: it.product.id },
            data: { lastSoldAt: saleDate },
          });
        }
      }
    }
  }

  // ---- Settings singleton ----
  await db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      shopName: "Sharma Bike Parts",
      ownerName: "Sharma Ji",
      address: "Main Road, Gopalganj, Bihar",
      phone: "9876543210",
      currency: "₹",
      theme: "light",
    },
  });

  console.log("✅ Seed complete!");
  console.log("   Admin login:  admin / admin123");
  console.log("   Staff login:  staff / staff123");
  console.log(`   Users: 2 | Categories: ${categoryData.length} | Locations: ${Object.keys(locationIds).length} | Products: ${products.length}`);
}
