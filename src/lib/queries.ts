import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Product,
  Category,
  Location,
  Movement,
  Settings,
  DashboardData,
  Customer,
  CustomerDetail,
  Sale,
  ChatMessage,
  AIInsights,
  AIRecognized,
  OCRResult,
  DuplicateGroup,
  LedgerEntry,
  StaffUser,
  DailyClosingReport,
  PaymentMode,
} from "./types";

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  // ---- STEP 1: Always read body as text first — NEVER call res.json() directly.
  // Reason: if the route is missing or Next.js crashes, it returns "Server action..."
  // or an HTML error page. Calling res.json() on that throws "Unexpected token 'S'",
  // which crashes the UI with a confusing error.
  const text = await res.text();

  // ---- STEP 2: Verify Content-Type is JSON (the user explicitly required this).
  // If the server returned HTML or text, we show a readable error instead of crashing.
  const ct = res.headers.get("content-type") || "";

  // ---- STEP 3: Try to parse JSON safely (try/catch — never throws).
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Response is NOT valid JSON (e.g. "Server action..." HTML or text error page)
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
      if (!res.ok) {
        // Show human-friendly error message instead of cryptic "Unexpected token"
        throw new Error(
          snippet ||
            `Server se sahi jawab nahi aaya (HTTP ${res.status}, ${ct || "no content-type"})`
        );
      }
      // 2xx but not JSON — treat as empty success
      return (data ?? {}) as T;
    }
  }

  // ---- STEP 4: Verify response.ok (2xx) — handle non-JSON content-type too.
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (HTTP ${res.status})`);
  }

  // ---- STEP 5: Warn in dev if response wasn't actually JSON (helps catch backend bugs)
  if (text && !ct.includes("application/json") && process.env.NODE_ENV !== "production") {
    console.warn(
      `[jfetch] Non-JSON response from ${url}: content-type="${ct}" status=${res.status}`
    );
  }

  return data as T;
}

// ---- Auth ----
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => jfetch<{ user: any }>("/api/auth/me"),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      jfetch<{ user: any }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => jfetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// ---- Products ----
export function useProducts(params?: {
  q?: string;
  category?: string;
  bike?: string;
  brand?: string;
  supplier?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  if (params?.bike) qs.set("bike", params.bike);
  if (params?.brand) qs.set("brand", params.brand);
  if (params?.supplier) qs.set("supplier", params.supplier);
  const key = qs.toString();
  return useQuery({
    queryKey: ["products", key],
    queryFn: () => jfetch<{ products: Product[] }>(`/api/products?${key}`),
  });
}

export function useAllProducts() {
  return useQuery({
    queryKey: ["products", "all"],
    queryFn: () => jfetch<{ products: Product[] }>(`/api/products`),
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => jfetch<{ product: Product }>(`/api/products/${id}`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) =>
      jfetch<{ product: Product }>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Product added");
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      jfetch<{ product: Product }>(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", v.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Product updated");
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jfetch(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Product deleted");
    },
  });
}

// ---- Categories ----
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => jfetch<{ categories: Category[] }>(`/api/categories`),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; icon?: string; color?: string }) =>
      jfetch<{ category: Category }>("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category added");
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jfetch(`/api/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Locations ----
export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => jfetch<{ locations: Location[] }>(`/api/locations`),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rack: string; row: number; box: number }) =>
      jfetch<{ location: Location }>("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location added");
    },
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jfetch(`/api/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location removed");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Movements ----
export function useMovements(productId?: string, limit = 100) {
  const qs = new URLSearchParams();
  if (productId) qs.set("productId", productId);
  qs.set("limit", String(limit));
  return useQuery({
    queryKey: ["movements", productId, limit],
    queryFn: () =>
      jfetch<{ movements: Movement[] }>(`/api/movements?${qs.toString()}`),
  });
}

// ---- Stock ----
export function useStockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      productId: string;
      quantity: number;
      reason?: string;
      note?: string;
    }) =>
      jfetch<{ product: Product }>("/api/stock/in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast.success("Stock added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useStockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      productId: string;
      quantity: number;
      reason?: string;
      note?: string;
    }) =>
      jfetch<{ product: Product }>("/api/stock/out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast.success("Stock removed");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Dashboard ----
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => jfetch<DashboardData>(`/api/dashboard`),
  });
}

// ---- Settings ----
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => jfetch<{ settings: Settings }>(`/api/settings`),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Settings>) =>
      jfetch<{ settings: Settings }>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      // Invalidate so any view using useSettings() (Dashboard, Sales bill,
      // Settings, etc.) re-renders with the fresh values — e.g. a newly
      // uploaded shop logo will immediately appear on the next bill.
      qc.invalidateQueries({ queryKey: ["settings"] });
      // NOTE: no generic toast here — callers (handleLogo, handleQr, the
      // various Save buttons) show their own contextual message so the user
      // knows exactly WHAT was saved.
    },
    onError: (e: any) => {
      toast.error(e?.message || "Settings save nahi hui");
    },
  });
}

// ---- Upload ----
// Uploads an image file to /uploads/<folder>/ on the server.
// Folders: "products" (default), "logos", "qr"
// Client-side validation: jpg/png/webp only, max 5 MB.
// Uses XMLHttpRequest for real upload progress reporting.
export type UploadFolder = "products" | "logos" | "qr";

function validateImageFile(file: File): string | null {
  // Returns an error message string, or null if valid
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return `Sirf JPG, PNG, WebP allowed hai. Mila: ${file.type || "unknown"}`;
  }
  if (file.size === 0) return "File khali hai";
  if (file.size > 5 * 1024 * 1024) {
    return `File bahut bada (${(file.size / 1024 / 1024).toFixed(
      1
    )} MB). Max 5 MB.`;
  }
  return null;
}

export function useUpload() {
  return useMutation({
    mutationFn: async (args: {
      file: File;
      folder?: UploadFolder;
      onProgress?: (pct: number) => void;
    }) => {
      const { file, folder = "products", onProgress } = args;

      // Client-side validation (fail fast, before hitting the network)
      const validationError = validateImageFile(file);
      if (validationError) {
        throw new Error(validationError);
      }

      const fd = new FormData();
      fd.append("file", file);

      // Use XMLHttpRequest so we can report real upload progress.
      // fetch() has no native upload progress in browsers.
      return new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/upload?folder=${encodeURIComponent(folder)}`);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          // Always read body as text first — never assume JSON
          const text = xhr.responseText || "";
          let data: any = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              // Non-JSON response (e.g. "Server action..." if route missing)
              const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
              reject(
                new Error(
                  snippet ||
                    `Upload failed (HTTP ${xhr.status})`
                )
              );
              return;
            }
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            if (data?.url) {
              resolve({ url: data.url });
            } else {
              reject(new Error(data?.error || "Upload failed — no URL"));
            }
          } else {
            reject(new Error(data?.error || `Upload failed (HTTP ${xhr.status})`));
          }
        };

        xhr.onerror = () =>
          reject(new Error("Network error — internet connection check karein"));
        xhr.ontimeout = () => reject(new Error("Upload timeout — dobara try karein"));

        xhr.send(fd);
      });
    },
    onError: (e: any) => toast.error(e.message || "Upload fail"),
  });
}

// Helper: read a File as a data URL (for local preview before upload)
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("File padhne mein error"));
    reader.readAsDataURL(file);
  });
}

// Helper: validate an image file client-side (returns error message or null)
export { validateImageFile };

// ---- Customers ----
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: () => jfetch<{ customers: Customer[] }>(`/api/customers`),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone?: string; type?: string; notes?: string }) =>
      jfetch<{ customer: Customer }>("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Sales ----
export function useSales(days = 30, limit = 100) {
  return useQuery({
    queryKey: ["sales", days, limit],
    queryFn: () =>
      jfetch<{ sales: Sale[] }>(`/api/sales?days=${days}&limit=${limit}`),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      items: { productId: string; quantity: number; price?: number }[];
      customerId?: string;
      note?: string;
      invoiceNo?: string;
      paymentMode?: PaymentMode;
      paidAmount?: number;
      discount?: number;
      cashAmount?: number;
      upiAmount?: number;
      creditAmount?: number;
      dueDate?: string;
    }) =>
      jfetch<{ sale: Sale }>("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Sale recorded 🎉");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Single sale (for bill print) ----
export function useSale(id: string | null) {
  return useQuery({
    queryKey: ["sale", id],
    queryFn: () => jfetch<{ sale: Sale }>(`/api/sales/${id}`),
    enabled: !!id,
  });
}

// ---- AI: Assistant Chat ----
export function useChatHistory() {
  return useQuery({
    queryKey: ["ai-chat-history"],
    queryFn: () => jfetch<{ messages: ChatMessage[] }>(`/api/ai/chat`),
  });
}

export function useAIChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { message: string; history?: { role: string; content: string }[] }) =>
      jfetch<{ reply: string }>("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-chat-history"] }),
    onError: (e: any) => toast.error(e.message || "AI failed"),
  });
}

// ---- AI: Natural Language Search ----
export function useAISearch() {
  return useMutation({
    mutationFn: (body: { query: string }) =>
      jfetch<{ interpretation: string; results: Product[] }>(`/api/ai/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onError: (e: any) => toast.error(e.message || "Search failed"),
  });
}

// ---- AI: Voice Search ----
export function useVoiceSearch() {
  return useMutation({
    mutationFn: (body: { audio: string }) =>
      jfetch<{ transcript: string; interpretation: string; results: Product[] }>(
        `/api/ai/voice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onError: (e: any) => toast.error(e.message || "Voice search failed"),
  });
}

// ---- AI: Insights ----
export function useAIInsights() {
  return useQuery({
    queryKey: ["ai-insights"],
    queryFn: () => jfetch<AIInsights>(`/api/ai/insights`),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

// ---- AI: Price Recommendation ----
export function usePriceRecommendation() {
  return useMutation({
    mutationFn: (body: { productId: string }) =>
      jfetch<{
        suggestedPrice: number;
        margin: number;
        profit: number;
        reasoning: string;
        action: string;
      }>(`/api/ai/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onError: (e: any) => toast.error(e.message || "Price recommendation failed"),
  });
}

// ---- AI: Duplicate Detection ----
export function useDuplicates() {
  return useQuery({
    queryKey: ["ai-duplicates"],
    queryFn: () => jfetch<{ groups: DuplicateGroup[] }>(`/api/ai/duplicates`),
  });
}

// ---- AI: Product Recognition (VLM) ----
export function useRecognizeProduct() {
  return useMutation({
    mutationFn: (body: { image: string }) =>
      jfetch<{ recognized: AIRecognized | null; message?: string }>(
        `/api/ai/recognize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onError: (e: any) => toast.error(e.message || "Recognition failed"),
  });
}

// ---- AI: OCR Invoice Scanner (VLM) ----
export function useOCRInvoice() {
  return useMutation({
    mutationFn: (body: { image: string }) =>
      jfetch<OCRResult>(`/api/ai/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onError: (e: any) => toast.error(e.message || "OCR failed"),
  });
}

// ---- AI: Report Generation ----
export function useAIReport() {
  return useMutation({
    mutationFn: (body: { type: "daily" | "weekly" | "insights" }) =>
      jfetch<{ report: string; type: string; generatedAt: string }>(
        `/api/ai/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onError: (e: any) => toast.error(e.message || "Report generation failed"),
  });
}

// ---- AI: Daily Closing Report ----
export function useDailyClosing() {
  return useMutation({
    mutationFn: () =>
      jfetch<{ report: DailyClosingReport }>(`/api/ai/daily-closing`, {
        method: "POST",
      }),
    onError: (e: any) => toast.error(e.message || "Daily closing failed"),
  });
}

// ---- AI receipt message (personalized thank-you + service tip) ----
export function useReceiptMessage() {
  return useMutation({
    mutationFn: (saleId: string) =>
      jfetch<{ message: string }>(`/api/ai/receipt-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId }),
      }),
    onError: (e: any) => toast.error(e.message || "AI message fail"),
  });
}

// ---- Customer detail (with ledger + sales) ----
export function useCustomerDetail(id: string | null) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: () => jfetch<{ customer: CustomerDetail }>(`/api/customers/${id}`),
    enabled: !!id,
  });
}

// ---- Ledger: record payment / advance ----
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      customerId: string;
      type: "PAYMENT" | "ADVANCE" | "ADJUSTMENT";
      amount: number;
      note?: string;
      dueDate?: string;
    }) =>
      jfetch<{ entry: LedgerEntry; outstanding: number; advance: number }>(
        `/api/customers/${body.customerId}/ledger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["customer", vars.customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        vars.type === "PAYMENT"
          ? "Payment recorded 🎉"
          : vars.type === "ADVANCE"
          ? "Advance recorded"
          : "Adjustment saved"
      );
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Staff management ----
export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: () => jfetch<{ staff: StaffUser[] }>(`/api/staff`),
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      username: string;
      password: string;
      name: string;
      role?: string;
      phone?: string;
    }) =>
      jfetch<{ staff: StaffUser }>(`/api/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff user created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        role?: string;
        phone?: string;
        active?: boolean;
        password?: string;
      };
    }) =>
      jfetch<{ staff: StaffUser }>(`/api/staff/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jfetch(`/api/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff user deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
