export type Role = "ADMIN" | "MANAGER" | "SALESMAN" | "MECHANIC";

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone?: string;
};

export type PaymentMode = "CASH" | "UPI" | "CREDIT" | "SPLIT";
export type SaleStatus = "PAID" | "PARTIAL" | "PENDING";
export type LedgerType = "CREDIT" | "PAYMENT" | "ADVANCE" | "ADJUSTMENT";
export type ReceiptSize = "58" | "80" | "A4";

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: string;
  _count?: { products: number };
};

export type Location = {
  id: string;
  code: string;
  rack: string;
  row: number;
  box: number;
  createdAt: string;
  products?: {
    id: string;
    name: string;
    quantity: number;
    minStock: number;
  }[];
};

export type Product = {
  id: string;
  name: string;
  bikeModels: string;
  brand: string;
  oemNumber: string;
  categoryId: string | null;
  category: Category | null;
  locationId: string | null;
  location: Location | null;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  supplier: string;
  photo: string | null;
  notes: string;
  barcode: string | null;
  qrCode: string | null;
  batchNo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MovementType = "ADDED" | "REMOVED" | "RETURNED" | "ADJUSTED";

export type Movement = {
  id: string;
  productId: string;
  product?: { id: string; name: string; oemNumber: string };
  type: MovementType;
  quantity: number;
  reason: string;
  note: string;
  userId: string | null;
  user?: { id: string; name: string; role: string } | null;
  createdAt: string;
};

export type Settings = {
  id: string;
  shopName: string;
  ownerName: string;
  address: string;
  phone: string;
  currency: string;
  theme: string;
  logo: string | null;
  upiId: string | null;
  upiQrImage: string | null;
  upiApps: string;
  gstNumber: string | null;
  receiptSize: string; // "58" | "80" | "A4"
  printerType: string; // "thermal" | "a4" | "pdf"
  whatsappEnabled: boolean;
  whatsappTemplate: string;
  thankYouTemplate: string;
  billTemplate: string;
  smsEnabled: boolean;
  backupEnabled: boolean;
  billFooter: string;
  // AI provider config (DB-backed so keys survive Vercel redeployments)
  aiProvider?: string; // "openrouter" | "groq" | "gemini" | "auto"
  aiApiKey?: string;   // masked in GET response (••••1234)
  aiKeySet?: boolean;  // true if a key is stored in DB
  aiTextModel?: string | null;
  aiVisionModel?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  type: string;
  notes: string;
  outstanding: number;
  advance: number;
  createdAt: string;
  _count?: { sales: number };
};

export type LedgerEntry = {
  id: string;
  customerId: string;
  saleId: string | null;
  sale?: { id: string; invoiceNo: string; total: number } | null;
  type: LedgerType;
  amount: number;
  balance: number;
  note: string;
  dueDate: string | null;
  userId: string | null;
  createdAt: string;
};

export type CustomerDetail = Customer & {
  ledger: LedgerEntry[];
  sales: Sale[];
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId: string;
  name: string;
  price: number;
  purchasePrice: number;
  quantity: number;
  subtotal: number;
  product?: { id: string; name: string; photo: string | null; location: { code: string } | null };
};

export type Sale = {
  id: string;
  invoiceNo: string;
  customerId: string | null;
  customer: { id: string; name: string; type: string; phone: string } | null;
  userId: string | null;
  user: { name: string } | null;
  total: number;
  subtotal: number;
  discount: number;
  profit: number;
  itemCount: number;
  note: string;
  paymentMode: PaymentMode;
  paidAmount: number;
  cashAmount: number;
  upiAmount: number;
  creditAmount: number;
  dueDate: string | null;
  status: SaleStatus;
  createdAt: string;
  items: SaleItem[];
};

export type StaffUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone: string;
  active: boolean;
  createdAt: string;
  _count?: { sales: number };
};

export type DailyClosingReport = {
  date: string;
  summary: {
    totalSales: number;
    totalRevenue: number;
    totalProfit: number;
    cashTotal: number;
    upiTotal: number;
    creditTotal: number;
    salesCount: number;
    newCustomers: number;
    itemsSold: number;
  };
  topSelling: { name: string; brand: string; qty: number; revenue: number }[];
  lowStock: { name: string; brand: string; quantity: number; minStock: number }[];
  aiReport: string; // LLM-generated narrative + tomorrow's purchase suggestions
  generatedAt: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type AIInsights = {
  generatedAt: string;
  purchaseList: {
    productId: string;
    name: string;
    brand: string;
    currentQty: number;
    suggestedQty: number;
    reason: string;
  }[];
  deadStock: {
    productId: string;
    name: string;
    brand: string;
    qty: number;
    daysUnsold: number;
    suggestion: string;
  }[];
  predictions: {
    productId: string;
    name: string;
    currentQty: number;
    avgDailySale: number;
    daysRemaining: number;
    recommendation: string;
  }[];
  recommendations: {
    title: string;
    detail: string;
    relatedProductIds: string[];
  }[];
  summary: string;
};

export type AIRecognized = {
  name: string;
  brand: string;
  oemNumber: string;
  category: string;
  bikeModels: string;
  suggestedPurchasePrice: number;
  suggestedSellingPrice: number;
  notes: string;
  confidence: string;
};

export type OCRItem = {
  name: string;
  qty: number;
  price: number;
  total: number;
};

export type OCRResult = {
  supplier: string;
  invoiceNo: string;
  date: string;
  items: OCRItem[];
  grandTotal: number;
};

export type DuplicateGroup = {
  products: string[];
  reason: string;
  suggestedName: string;
};

export type DashboardData = {
  stats: {
    totalProducts: number;
    totalQuantity: number;
    outOfStockCount: number;
    lowStockCount: number;
    stockValue: number;
    purchaseValue: number;
    categories: number;
    locations: number;
    occupiedLocations: number;
    stockInToday: number;
    stockOutToday: number;
    todaySalesCount: number;
    todayRevenue: number;
    todayProfit: number;
    todayCashTotal: number;
    todayUpiTotal: number;
    todayCreditTotal: number;
    totalOutstanding: number;
  };
  outOfStock: Product[];
  lowStock: Product[];
  recentProducts: Product[];
  recentMovements: Movement[];
  recentSales: Sale[];
  categoryBreakdown: { name: string; count: number; quantity: number }[];
};

// Stock status helper
export type StockStatus = "out" | "low" | "high";

export function getStockStatus(p: {
  quantity: number;
  minStock: number;
}): StockStatus {
  if (p.quantity <= 0) return "out";
  if (p.quantity <= p.minStock) return "low";
  return "high";
}

export function getBikeModels(p: { bikeModels: string }): string[] {
  return p.bikeModels
    ? p.bikeModels.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

// ---- Location display helper ----
// Location codes come in two flavours:
//   1. Simple box mode (auto-generated via /api/locations/bulk):
//      code is a plain number string like "1", "27", "100".
//      We render these as "Box #27" for clarity — the raw "27" alone
//      looks ambiguous next to product quantities/OEM numbers.
//   2. Rack-style codes (manually created via Add Box dialog):
//      code looks like "A-1-04" or "B-2-12". These are already
//      meaningful, so we render them as-is.
//
// Use this anywhere a location chip/label is shown to the user
// (product cards, find-part results, stock-in/out detail, receipts).
export function displayLocation(code: string | null | undefined): string {
  if (!code) return "";
  // Purely numeric → simple box mode
  if (/^\d+$/.test(code)) return `Box #${code}`;
  return code;
}

// ---- Multi-image helpers ----
// The Product.photo field stores one or more image URLs as a comma-separated
// string (e.g. "/uploads/products/a.png,/uploads/products/b.png"). This keeps
// the schema backward-compatible with single-image entries while supporting
// multiple images per product. These helpers split/join the field safely.
//
// IMPORTANT: We CANNOT just split on every comma, because data: URLs
// (base64-encoded images saved when upload hasn't finished yet) contain a
// comma between their MIME header and the base64 payload, e.g.
//   data:image/png;base64,iVBORw0KGgo...
// A naive split(",") would shatter a data URL into two bogus pieces
// ("data:image/png;base64" + the base64 blob), causing the image to fail
// to load. So we use a tokenizer that keeps each data URL intact.
export function getProductPhotos(photo: string | null | undefined): string[] {
  if (!photo) return [];
  // Match either:
  //   1. A full data URL:  data:<header>,<payload>   (header & payload have no commas)
  //   2. Any other token:  a normal path / URL with no commas
  const tokenRegex = /data:[^,]*,[^,]*|[^,]+/g;
  const matches = photo.match(tokenRegex) || [];
  return matches
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getPrimaryPhoto(
  photo: string | null | undefined
): string | null {
  const photos = getProductPhotos(photo);
  return photos[0] || null;
}

export function joinPhotos(photos: string[]): string {
  return photos.filter(Boolean).join(",");
}

export type View =
  | "dashboard"
  | "products"
  | "product-detail"
  | "product-form"
  | "categories"
  | "locations"
  | "stock-in"
  | "stock-out"
  | "reports"
  | "settings"
  | "ai-assistant"
  | "ai-insights"
  | "sales"
  | "customers"
  | "customer-detail"
  | "close-shop";
