"use client";

import { useMemo, useRef, useState } from "react";
import {
  useAllProducts,
  useStockIn,
  useStockOut,
  useOCRInvoice,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import {
  type Product,
  type OCRResult,
  type OCRItem,
  displayLocation,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Package,
  MapPin,
  X,
  Loader2,
  ArrowLeft,
  ScanLine,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Calendar,
  Hash,
  Building2,
} from "lucide-react";

// Convert a File to a base64 data URL for VLM OCR
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("File read nahi ho paayi"));
    reader.readAsDataURL(file);
  });
}

// Fuzzy match an OCR line item name to an existing product
function findProductMatch(name: string, products: Product[]): Product | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const invoiceTokens = n.split(/[\s,\-]+/).filter((t) => t.length > 2);
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const pn = p.name.toLowerCase();
    const oem = (p.oemNumber || "").toLowerCase();
    const brand = (p.brand || "").toLowerCase();
    let score = 0;
    if (pn === n) score = 100;
    else if (pn.includes(n) || n.includes(pn)) score = 60;
    else {
      for (const t of invoiceTokens) {
        if (pn.includes(t)) score += 10;
        if (brand && brand.includes(t)) score += 6;
        if (oem && oem.includes(t)) score += 15;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 16 ? best : null;
}

function formatINR(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN");
}

type MatchedItem = {
  item: OCRItem;
  product: Product | null;
};

const REASONS_IN = ["New purchase", "Restock", "Return from customer", "Stock correction"];
const REASONS_OUT = ["Sold to customer", "Given to mechanic", "Damaged/Scrap", "Stock correction"];

export function StockView({ direction }: { direction: "in" | "out" }) {
  const { data, isLoading } = useAllProducts();
  const stockIn = useStockIn();
  const stockOut = useStockOut();
  const ocrInvoice = useOCRInvoice();
  const { go, openProduct } = useUI();

  const isOut = direction === "out";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState(isOut ? REASONS_OUT[0] : REASONS_IN[0]);
  const [note, setNote] = useState("");

  // OCR Invoice Scanner state (stock-in only)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [applyProgress, setApplyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [applySummary, setApplySummary] = useState<{
    updated: number;
    failed: number;
    unmatched: number;
  } | null>(null);

  const products = data?.products || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) =>
        [p.name, p.oemNumber, p.brand, p.bikeModels, p.location?.code || ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
  }, [products, query]);

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Sirf image file chunein");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setOcrImage(dataUrl);
      setOcrResult(null);
      setApplySummary(null);
      ocrInvoice.mutate(
        { image: dataUrl },
        {
          onSuccess: (res) => {
            setOcrResult(res);
            if (!res?.items?.length) {
              toast.error("Invoice mein koi items nahi mila");
            }
          },
          onError: () => {
            setOcrImage(null);
          },
        }
      );
    } catch {
      toast.error("Image load nahi ho paayi");
    }
  };

  const matchedItems: MatchedItem[] = useMemo(() => {
    if (!ocrResult) return [];
    return ocrResult.items.map((item) => ({
      item,
      product: findProductMatch(item.name, products),
    }));
  }, [ocrResult, products]);

  const applyAll = async () => {
    if (!ocrResult || matchedItems.length === 0) return;
    const toApply = matchedItems.filter((m) => m.product);
    if (toApply.length === 0) {
      toast.error("Koi matched product nahi mila");
      return;
    }
    setApplyProgress({ done: 0, total: toApply.length });
    let updated = 0;
    let failed = 0;
    for (const m of toApply) {
      try {
        await stockIn.mutateAsync({
          productId: m.product!.id,
          quantity: m.item.qty,
          reason: "New purchase",
          note: `Invoice ${ocrResult.invoiceNo || "-"} · ${ocrResult.supplier || ""}`.trim(),
        });
        updated++;
      } catch {
        failed++;
      }
      setApplyProgress({ done: updated + failed, total: toApply.length });
    }
    const unmatched = matchedItems.length - toApply.length;
    setApplySummary({ updated, failed, unmatched });
    setApplyProgress(null);
    setOcrResult(null);
    setOcrImage(null);
    toast.success(
      `${updated} products updated, ${unmatched} naye items mile`
    );
  };

  const resetOCR = () => {
    setOcrResult(null);
    setOcrImage(null);
    setApplySummary(null);
    setApplyProgress(null);
  };

  const submit = () => {
    if (!selected) {
      toast.error("Select a product first");
      return;
    }
    const n = Number(qty);
    if (!n || n <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (isOut && n > selected.quantity) {
      toast.error(`Only ${selected.quantity} in stock`);
      return;
    }
    const fn = isOut ? stockOut : stockIn;
    fn.mutate(
      { productId: selected.id, quantity: n, reason, note },
      {
        onSuccess: () => {
          setSelected(null);
          setQty("1");
          setNote("");
          setQuery("");
        },
      }
    );
  };

  const accent = isOut ? "red" : "emerald";
  const Icon = isOut ? ArrowUpFromLine : ArrowDownToLine;
  const reasons = isOut ? REASONS_OUT : REASONS_IN;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => go("dashboard")} className="md:hidden">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-2xl text-white shadow-glow",
              isOut ? "bg-red-500" : "bg-emerald-600"
            )}
          >
            <Icon className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Stock {isOut ? "Out" : "In"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isOut ? "Remove items from inventory" : "Add items to inventory"}
            </p>
          </div>
        </div>
      </div>

      {/* AI Invoice Scanner — stock-in only */}
      {!isOut && !selected && (
        <Card className="shadow-soft border-primary/30">
          <CardContent className="p-4 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Idle state */}
            {!ocrInvoice.isPending && !ocrResult && !applySummary && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 touch-target"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                  <ScanLine className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    AI Invoice Scan karein
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invoice ki photo lein — AI khud padh lega aur stock update karega
                  </p>
                </div>
                <Camera className="size-5 text-primary shrink-0" />
              </button>
            )}

            {/* Loading state */}
            {ocrInvoice.isPending && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
                {ocrImage && (
                  <div className="relative">
                    <img
                      src={ocrImage}
                      alt="Invoice"
                      className="h-32 w-auto rounded-lg border border-border object-contain"
                    />
                    <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                      <ScanLine className="size-7 text-white animate-pulse" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Loader2 className="size-4 animate-spin" />
                  AI invoice padh raha hai...
                </div>
                <p className="text-xs text-muted-foreground">
                  5-10 second wait karein
                </p>
              </div>
            )}

            {/* Result preview */}
            {ocrResult && !applyProgress && (
              <div className="space-y-3">
                {/* Invoice header */}
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="size-4 shrink-0 text-primary" />
                      <p className="truncate text-sm font-bold">
                        {ocrResult.supplier || "Supplier nahi mila"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      onClick={resetOCR}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Hash className="size-3" />
                      {ocrResult.invoiceNo || "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="size-3" />
                      {ocrResult.date || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-1.5">
                    <span className="text-xs text-muted-foreground">Grand Total</span>
                    <span className="text-base font-bold text-primary">
                      {formatINR(ocrResult.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Line items */}
                <div className="space-y-2 max-h-72 overflow-y-auto scroll-thin">
                  {matchedItems.map((m, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border p-2.5 space-y-1.5",
                        m.product
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-amber-500/40 bg-amber-500/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {m.item.name || `Item ${idx + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Qty {m.item.qty} × {formatINR(m.item.price)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold">
                          {formatINR(m.item.total)}
                        </span>
                      </div>
                      {m.product ? (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium min-w-0">
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            <span className="truncate">
                              {m.product.name}
                            </span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            Stock: {m.product.quantity} →{" "}
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {m.product.quantity + m.item.qty}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="size-3.5" />
                          Match nahi hua — naya product
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Apply button */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1 rounded-xl"
                    onClick={resetOCR}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={applyAll}
                    disabled={matchedItems.filter((m) => m.product).length === 0}
                    className="h-11 flex-[2] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-glow"
                  >
                    <Check className="size-4" />
                    Apply All (
                    {matchedItems.filter((m) => m.product).length}/{matchedItems.length}
                    )
                  </Button>
                </div>
              </div>
            )}

            {/* Applying progress */}
            {applyProgress && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
                <Loader2 className="size-7 animate-spin text-emerald-600" />
                <p className="text-sm font-medium">
                  Stock update ho raha hai... {applyProgress.done}/
                  {applyProgress.total}
                </p>
                <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{
                      width: `${
                        applyProgress.total
                          ? (applyProgress.done / applyProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Summary after apply */}
            {applySummary && !ocrResult && (
              <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    Stock update ho gaya!
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {applySummary.updated}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Updated</p>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p className="text-lg font-bold text-amber-500">
                      {applySummary.unmatched}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Naye items</p>
                  </div>
                  <div className="rounded-lg bg-background p-2">
                    <p
                      className={cn(
                        "text-lg font-bold",
                        applySummary.failed > 0 ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {applySummary.failed}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="h-10 w-full rounded-xl"
                  onClick={resetOCR}
                >
                  <RefreshCw className="size-4" /> Aur scan karein
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Product selector */}
      {!selected ? (
        <Card className="shadow-soft">
          <CardContent className="p-4 space-y-3">
            <Label className="text-sm font-medium">Find Product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-12 pl-11 rounded-xl text-base"
                placeholder="Type name, OEM, or location code..."
                autoFocus
              />
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query ? "No products match" : "Start typing to search"}
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelected(p);
                      setQty("1");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      <SafeImage
                        src={p.photo}
                        alt={p.name}
                        className="size-full object-cover"
                        placeholder={<Package className="size-5 text-muted-foreground" />}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.brand} · {p.oemNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{p.quantity}</p>
                      {p.location && (
                        <p className="text-[11px] text-primary font-mono">
                          {displayLocation(p.location.code)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-soft">
          <CardContent className="p-4 space-y-4">
            {/* Selected product */}
            <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                <SafeImage
                  src={selected.photo}
                  alt={selected.name}
                  className="size-full object-cover"
                  placeholder={<Package className="size-6 text-muted-foreground" />}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.brand} · {selected.oemNumber}
                </p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <StockBadge
                    quantity={selected.quantity}
                    minStock={selected.minStock}
                    className="text-[10px]"
                  />
                  {selected.location && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                      <MapPin className="size-3" />
                      {displayLocation(selected.location.code)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Quantity */}
            <div>
              <Label className="text-sm font-medium">
                Quantity to {isOut ? "remove" : "add"}
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="size-12 rounded-xl p-0 text-xl"
                  onClick={() =>
                    setQty(String(Math.max(1, Number(qty) - 1)))
                  }
                >
                  −
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-12 rounded-xl text-center text-xl font-bold"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="size-12 rounded-xl p-0 text-xl"
                  onClick={() => setQty(String(Number(qty) + 1))}
                >
                  +
                </Button>
              </div>
              {isOut && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Available: {selected.quantity} · After:{" "}
                  <span className="font-semibold">
                    {Math.max(0, selected.quantity - Number(qty))}
                  </span>
                </p>
              )}
              {!isOut && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Current: {selected.quantity} · After:{" "}
                  <span className="font-semibold">
                    {selected.quantity + Number(qty)}
                  </span>
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <Label className="text-sm font-medium">Reason</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium border transition-colors",
                      reason === r
                        ? isOut
                          ? "bg-red-500 text-white border-red-500"
                          : "bg-emerald-600 text-white border-emerald-600"
                        : "bg-card border-border hover:bg-accent"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <Label className="text-sm font-medium">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 rounded-xl"
                placeholder="Any extra detail..."
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-xl"
                onClick={() => setSelected(null)}
              >
                Back
              </Button>
              <Button
                onClick={submit}
                disabled={stockIn.isPending || stockOut.isPending}
                className={cn(
                  "h-12 flex-1 rounded-xl shadow-glow",
                  isOut
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
              >
                {stockIn.isPending || stockOut.isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check className="size-5" /> Confirm Stock {isOut ? "Out" : "In"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Button
          variant="link"
          className="w-full"
          onClick={() => openProduct(selected.id)}
        >
          View full product details →
        </Button>
      )}
    </div>
  );
}
