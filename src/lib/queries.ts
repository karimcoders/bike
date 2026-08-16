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

export async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
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
      // Response is NOT valid JSON. This happens when:
      //   - The route is missing (Next.js 404 HTML page)
      //   - The server crashes (Next.js 500 HTML error page)
      //   - A serverless function times out (Vercel error HTML page)
      //   - A middleware/auth layer returns an HTML login redirect
      // NEVER surface the raw HTML to the user — it looks like
      // "<!DOCTYPE html><!--...-->" in a red toast, which is confusing
      // and makes the app look broken. Show a clean message instead.
      if (!res.ok) {
        throw new Error(
          `Server se sahi jawab nahi aaya (HTTP ${res.status}). Thodi der baad try karein.`
        );
      }
      // 2xx but not JSON — treat as empty success
      return (data ?? {}) as T;
    }
  }

  // ---- STEP 4: Verify response.ok (2xx) — handle non-JSON content-type too.
  if (!res.ok) {
    // Only use server-provided error field if it's a real string.
    // Never fall back to raw response body (could be HTML).
    const errMsg =
      typeof data?.error === "string" && data.error.trim()
        ? data.error
        : `Request failed (HTTP ${res.status})`;
    throw new Error(errMsg);
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

// ---- Login error translation ----
// Converts raw browser/server errors into friendly Hindi/English messages
// that a rural shop owner can understand. NEVER shows "Failed to fetch",
// "Unexpected token", or "Server action not found" to the user.
function friendlyLoginError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);

  // Network error (browser couldn't reach the server at all)
  if (
    raw.includes("Failed to fetch") ||
    raw.includes("NetworkError") ||
    raw.includes("network") ||
    raw.includes("ERR_NETWORK") ||
    raw.includes("ERR_CONNECTION") ||
    raw.includes("ERR_INTERNET_DISCONNECTED")
  ) {
    return new Error("Internet connection check karein.");
  }

  // Timeout (AbortController fired — server took too long)
  if (raw.includes("aborted") || raw.includes("timeout") || raw.includes("The user aborted a request")) {
    return new Error("Server response nahi de raha. Dobara try karein.");
  }

  // 429 Too Many Requests (rate limited)
  if (raw.includes("429") || raw.toLowerCase().includes("too many")) {
    return new Error("Bahut zyada attempts. Thodi der baad try karein.");
  }

  // 500/502/503 server errors
  if (/5\d\d/.test(raw) || raw.includes("server") || raw.includes("Server")) {
    return new Error("Server se connection nahi ho pa raha. Dobara try karein.");
  }

  // 401/403 invalid credentials — use the server's message (already friendly)
  if (raw.includes("401") || raw.includes("403") || raw.includes("Invalid username or password")) {
    return new Error("Username ya password galat hai.");
  }

  // Empty username/password (client-side validation message from server)
  if (raw.includes("Username and password required")) {
    return new Error("Username aur password dono daalein.");
  }

  // Fall back to the server message if it looks like a real sentence, else generic
  if (raw.length > 5 && raw.length < 200 && /^[a-zA-Z0-9 .,!?]/.test(raw)) {
    return new Error(raw);
  }
  return new Error("Login nahi ho paya. Dobara try karein.");
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { username: string; password: string }) => {
      // ---- 15-second timeout via AbortController ----
      // If the login API doesn't respond within 15s (e.g., Neon cold-start
      // hangs or the network drops mid-request), abort the fetch so the
      // button doesn't stay "Logging in..." forever. The user gets a clear
      // "Server response nahi de raha" message and can retry.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      try {
        return await jfetch<{ user: any }>("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        // Translate raw browser errors into friendly Hindi/English messages
        // BEFORE React Query stores them in mutation.error. This guarantees
        // the UI never shows "Failed to fetch" or "Unexpected token".
        console.error("[login] failed:", e);
        throw friendlyLoginError(e);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    // Set the user data directly from the login response instead of
    // invalidating + refetching /api/auth/me. This eliminates a duplicate
    // network call (~1s on Vercel cold start) and makes login feel instant.
    // The login API calls createSession() (sets the bip_session cookie) BEFORE
    // returning 200, so by the time onSuccess fires, the cookie is guaranteed
    // to be set. We trust the 200 response — no need for a second /api/auth/me
    // verification call (which would add ~1s on cold start).
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => jfetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // ---- Immediate UI transition to LoginView ----
      // Set the ["me"] query cache to { user: null } SYNCHRONOUSLY. This makes
      // the Home component re-render immediately (data?.user is now null) →
      // LoginView shows WITHOUT waiting for a network refetch.
      //
      // The logout API has already destroyed the bip_session cookie server-side
      // (verified in production), so even if the user reloads, /api/auth/me
      // will return { user: null } and they'll stay on LoginView.
      //
      // We also clear all other queries (products, dashboard, etc.) so no stale
      // shop data from the previous session leaks into the next login.
      qc.setQueryData(["me"], { user: null });
      qc.clear({ exclude: ["me"] });
    },
    onError: () => {
      // Even if the logout API call fails (network error, etc.), force the UI
      // to LoginView locally — the cookie may still be present server-side,
      // but the user clearly wants to log out. A reload will re-evaluate.
      qc.setQueryData(["me"], { user: null });
      qc.clear({ exclude: ["me"] });
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
    // Simple mode: pass { number: N } to create Box N (code=String(N),
    // rack="BOX", row=1, box=N). Legacy mode { rack, row, box } is still
    // supported by the API but not exposed in the UI anymore.
    mutationFn: (body: { number: number } | { rack: string; row: number; box: number }) =>
      jfetch<{ location: Location }>("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Box add ho gaya");
    },
  });
}

// Bulk-create N simple box locations (or per-rack locations) via
// POST /api/locations/bulk. The mutation just fires the request and
// invalidates the locations query; callers are responsible for showing
// a success toast (since the count is part of the response payload).
export function useBulkCreateLocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      count: number;
      mode?: "simple" | "rack";
      racks?: { name: string; count: number }[];
    }) =>
      // NOTE: /api/locations/bulk returns { created, skipped, total }
      // DIRECTLY via ok() — NOT wrapped in { success, data }.
      jfetch<{ created: number; skipped: number; total: number }>(`/api/locations/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
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

// Rename / update a single location (PATCH /api/locations/[id]).
// The owner renames a box code (e.g. "27" → "27A"). Caller shows its own
// success toast since the new name is part of the context.
export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { code: string; rack?: string; row?: number; box?: number };
    }) =>
      jfetch<{ location: Location }>(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

// Bulk-delete EMPTY locations only (DELETE /api/locations/bulk).
// Returns { deleted, skipped } so the caller can report which occupied
// boxes were protected. Products are never deleted by this endpoint.
export function useBulkDeleteLocations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      jfetch<{
        deleted: number;
        skipped: { id: string; code: string; productCount: number }[];
      }>(`/api/locations/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

// Fetch ONE location WITH its full product list (GET /api/locations/[id]).
// Used when the owner opens a box to see what's inside. Enabled only when
// an id is provided so it doesn't fire on mount.
export function useLocationProducts(id: string | null) {
  return useQuery({
    queryKey: ["location", id],
    queryFn: () =>
      jfetch<{ location: Location }>(`/api/locations/${id}`),
    enabled: !!id,
  });
}

// ---- Admin: wipe all business data (fresh-shop reset) ----
// POST /api/admin/wipe-business deletes every product, customer, sale,
// ledger, movement, location and chat message, then resets Settings to
// factory-empty. Admin-only. Users + categories are preserved.
export function useWipeBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      jfetch<{
        wiped: Record<string, number>;
        remaining: Record<string, number>;
        settings: {
          shopName: string;
          ownerName: string;
          phone: string;
          logo: string | null;
          upiId: string | null;
          upiQrImage: string | null;
        };
        triggeredBy: { id: string; username: string; role: string };
      }>(`/api/admin/wipe-business`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "WIPE" }),
      }),
    onSuccess: () => {
      // Invalidate EVERYTHING — the whole shop is now empty.
      qc.invalidateQueries();
    },
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
    queryFn: async () => {
      const data = await jfetch<DashboardData>(`/api/dashboard`);
      // Persist to localStorage for INSTANT next-load rendering.
      // On the next page load, useDashboard reads this cache as initialData
      // so the dashboard renders immediately (no skeleton) while fresh data
      // fetches in the background. This is the single biggest perceived-
      // speed win for repeat visits: 4s cold dashboard → instant render.
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cache:dashboard",
            JSON.stringify({ ts: Date.now(), data })
          );
        }
      } catch {
        // localStorage may be full or disabled — ignore.
      }
      return data;
    },
    // OPTIMISTIC RENDERING with SERVER-WINS guarantee:
    // Show the last-known dashboard data instantly (from localStorage) while
    // fresh data fetches in the background. The user sees real numbers
    // immediately instead of a 4-second skeleton.
    //
    // `initialDataUpdatedAt` = the localStorage cache's timestamp. This tells
    // React Query HOW STALE the initial data is. If the cache is older than
    // `staleTime` (30s), the query is immediately considered stale and a
    // background refetch fires on mount — so the server's latest data replaces
    // the cached data within ~1s. This is what guarantees multi-device sync:
    // even if desktop's localStorage still has yesterday's dashboard, the
    // moment the owner opens the app, it refreshes from the live DB.
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const raw = localStorage.getItem("cache:dashboard");
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as { ts: number; data: DashboardData };
        // Only use cache < 3 min old. This is a MULTI-DEVICE shop: if the
        // owner added a sale on mobile 5 minutes ago, desktop must NOT still
        // show yesterday's dashboard numbers from localStorage. A short TTL
        // + initialDataUpdatedAt + refetchOnMount guarantees the live DB
        // replaces the cache within ~1s of opening the app.
        if (Date.now() - parsed.ts > 3 * 60 * 1000) return undefined;
        return parsed.data;
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: () => {
      if (typeof window === "undefined") return 0;
      try {
        const raw = localStorage.getItem("cache:dashboard");
        if (!raw) return 0;
        const parsed = JSON.parse(raw) as { ts: number };
        return parsed.ts || 0;
      } catch {
        return 0;
      }
    },
    // Keep the cached data visible while refetching (no skeleton flash).
    // 30s staleTime + initialDataUpdatedAt = old cache triggers immediate refetch.
    staleTime: 30 * 1000,
  });
}

// ---- Settings ----
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const data = await jfetch<{ settings: Settings }>(`/api/settings`);
      // Cache settings in localStorage — they change rarely (shop name, logo,
      // UPI ID, etc.) and block the app shell render. Showing the last-known
      // settings instantly makes the header + shop name appear immediately.
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "cache:settings",
            JSON.stringify({ ts: Date.now(), data })
          );
        }
      } catch {
        // ignore
      }
      return data;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const raw = localStorage.getItem("cache:settings");
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as { ts: number; data: { settings: Settings } };
        // Settings change rarely, but this is a MULTI-DEVICE shop: if the
        // owner updates the shop name on mobile, desktop should pick it up
        // on the next app open (not show a 1-hour-old cache). 15 min TTL +
        // initialDataUpdatedAt + refetchOnMount = always reconciles with DB.
        if (Date.now() - parsed.ts > 15 * 60 * 1000) return undefined;
        return parsed.data;
      } catch {
        return undefined;
      }
    },
    // initialDataUpdatedAt = localStorage timestamp. If settings cache is older
    // than staleTime (60s), React Query refetches on mount — so a settings
    // change made on desktop surfaces on mobile the next time the owner opens
    // the app (instead of showing the 1-hour-old cache).
    initialDataUpdatedAt: () => {
      if (typeof window === "undefined") return 0;
      try {
        const raw = localStorage.getItem("cache:settings");
        if (!raw) return 0;
        const parsed = JSON.parse(raw) as { ts: number };
        return parsed.ts || 0;
      } catch {
        return 0;
      }
    },
    staleTime: 60 * 1000,
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
  // Max 15 MB for the ORIGINAL — we resize client-side before upload, so a
  // 15 MB camera photo becomes ~300 KB on the wire. This lets owners upload
  // full-resolution phone photos without hitting a size wall.
  if (file.size > 15 * 1024 * 1024) {
    return `File bahut bada (${(file.size / 1024 / 1024).toFixed(
      1
    )} MB). Max 15 MB.`;
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

      // ---- Client-side resize BEFORE upload ----
      // A 5-8 MB camera photo → ~200 KB JPEG. This is the single biggest
      // perf win: uploads finish in <1s even on slow rural connections,
      // and Vercel serverless never buffers a huge file.
      const keepPng = folder === "logos" || folder === "qr";
      const resized = await resizeImageClient(file, { keepPng });

      // ---- Try DIRECT browser → Cloudinary upload (signed) ----
      // Bypasses the Vercel serverless function entirely for the file
      // transfer. One hop, no serverless memory pressure, no 10s timeout.
      let cloudinaryConfigured = false;
      try {
        const signRes = await fetch(
          `/api/cloudinary/sign?folder=${encodeURIComponent(folder)}`
        );
        if (signRes.ok) {
          // NOTE: /api/cloudinary/sign uses ok() which returns the object
          // DIRECTLY (not wrapped in { data }). So we read signJson itself,
          // not signJson.data. The previous code read signJson?.data which
          // was always undefined → fell back to /api/upload → 404.
          const signData = await signRes.json();
          if (signData?.configured && signData?.uploadUrl) {
            cloudinaryConfigured = true;
            // If Cloudinary itself rejects the file (400/401/etc), surface
            // the REAL error to the user — do NOT fall back to /api/upload
            // (that route doesn't exist on Vercel → confusing 404).
            return await uploadToCloudinaryDirect(resized, signData, onProgress);
          }
        }
      } catch (e: any) {
        // If Cloudinary was configured but the UPLOAD failed (network error,
        // Cloudinary 400, etc), surface the real error — don't mask it with
        // a 404 from the non-existent /api/upload fallback.
        if (cloudinaryConfigured) {
          throw new Error(
            e?.message || "Cloudinary upload fail. Thodi der baad try karein."
          );
        }
        // Sign endpoint itself failed (not configured / network) — fall
        // through to server upload for local-dev backward-compat.
      }

      // ---- Fallback: server-side upload via /api/upload ----
      // ONLY reached when Cloudinary is NOT configured (local dev / sandbox).
      // On Vercel production Cloudinary IS configured, so this path is
      // never hit in production.
      return uploadViaServer(resized, folder, onProgress);
    },
    onError: (e: any) => toast.error(e.message || "Upload fail"),
  });
}

// ---- Direct browser → Cloudinary upload (signed) ----
// POST multipart/form-data to Cloudinary's REST API with a signature
// obtained from /api/cloudinary/sign. Returns { url: secure_url }.
async function uploadToCloudinaryDirect(
  file: File,
  sign: {
    uploadUrl: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    folder: string;
  },
  onProgress?: (pct: number) => void
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", sign.folder);
  fd.append("timestamp", String(sign.timestamp));
  fd.append("api_key", sign.apiKey);
  fd.append("signature", sign.signature);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sign.uploadUrl);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText || "");
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
        resolve({ url: data.secure_url });
      } else {
        reject(
          new Error(
            data?.error?.message ||
              `Cloudinary upload fail (HTTP ${xhr.status}). Thodi der baad try karein.`
          )
        );
      }
    };
    xhr.onerror = () =>
      reject(new Error("Network error — internet connection check karein"));
    xhr.ontimeout = () => reject(new Error("Upload timeout — dobara try karein"));
    xhr.send(fd);
  });
}

// ---- Fallback: server-side upload via /api/upload ----
async function uploadViaServer(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?folder=${encodeURIComponent(folder)}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      const text = xhr.responseText || "";
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          reject(
            new Error(
              `Upload fail ho gaya (HTTP ${xhr.status}). Thodi der baad try karein.`
            )
          );
          return;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
        resolve({ url: data.url });
      } else {
        reject(new Error(data?.error || `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Network error — internet connection check karein"));
    xhr.ontimeout = () => reject(new Error("Upload timeout — dobara try karein"));
    xhr.send(fd);
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

// ---- Client-side image resize ----
// Camera photos can be 4-8 MB. Resizing to max 1200px wide + JPEG 0.85
// before upload shrinks them to ~150-300 KB — 10-20x faster uploads and
// no serverless memory pressure. Returns a File (so it has a name/type).
//
// Uses createImageBitmap + canvas (supported in all modern browsers).
// If anything fails, returns the original file unchanged (graceful).
export async function resizeImageClient(
  file: File,
  opts?: { maxDim?: number; quality?: number; keepPng?: boolean }
): Promise<File> {
  const maxDim = opts?.maxDim ?? 1200;
  const quality = opts?.quality ?? 0.85;
  const keepPng = opts?.keepPng ?? false;

  // Never touch GIFs (would break animation) or SVGs (vector).
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const needsResize = width > maxDim || height > maxDim;
    // For product photos we re-encode to JPEG (smaller, no transparency
    // needed). For logos/QR we keep PNG to preserve transparency.
    const toJpeg = file.type !== "image/png" || !keepPng;

    // Nothing to do — already small AND keeping original format.
    if (!needsResize && !toJpeg) return file;

    if (needsResize) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const mime = toJpeg ? "image/jpeg" : file.type;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality)
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.\w+$/, "");
    const ext = toJpeg ? ".jpg" : file.name.match(/\.\w+$/)?.[0] || "";
    return new File([blob], baseName + ext, { type: mime });
  } catch {
    // createImageBitmap not supported or decode failed — upload original.
    return file;
  }
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
