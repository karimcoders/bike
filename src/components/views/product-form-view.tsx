"use client";

import { useEffect, useRef, useState } from "react";
import {
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useCategories,
  useLocations,
  useUpload,
  useRecognizeProduct,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SafeImage } from "@/components/ui/safe-image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Upload,
  X,
  Loader2,
  Save,
  Package,
  ScanLine,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  getProductPhotos,
  joinPhotos,
  type AIRecognized,
} from "@/lib/types";

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function ProductFormView() {
  const { editingProductId, go } = useUI();
  const isEdit = !!editingProductId;
  const { data: existing, isLoading } = useProduct(editingProductId);
  const { data: catData } = useCategories();
  const { data: locData } = useLocations();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const upload = useUpload();
  const recognize = useRecognizeProduct();
  const fileRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const categories = catData?.categories || [];
  const allLocations = locData?.locations || [];

  const [form, setForm] = useState({
    name: "",
    bikeModels: "",
    brand: "",
    oemNumber: "",
    categoryId: "",
    locationId: "",
    purchasePrice: "",
    sellingPrice: "",
    quantity: "",
    minStock: "5",
    supplier: "",
    photos: [] as string[],
    notes: "",
    barcode: "",
  });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [aiResult, setAiResult] = useState<
    | { recognized: AIRecognized | null; categoryMatched: boolean }
    | null
  >(null);

  useEffect(() => {
    if (isEdit && existing?.product) {
      const p = existing.product;
      setForm({
        name: p.name,
        bikeModels: p.bikeModels,
        brand: p.brand,
        oemNumber: p.oemNumber,
        categoryId: p.categoryId || "",
        locationId: p.locationId || "",
        purchasePrice: String(p.purchasePrice),
        sellingPrice: String(p.sellingPrice),
        quantity: String(p.quantity),
        minStock: String(p.minStock),
        supplier: p.supplier,
        photos: getProductPhotos(p.photo),
        notes: p.notes,
        barcode: p.barcode || "",
      });
    }
  }, [isEdit, existing]);

  // Available locations = empty ones + current (if editing).
  // Uses productCount from the optimized list endpoint (count-only, no
  // product joins). Falls back to products.length for any cached payload
  // that still carries the old shape.
  const availableLocations = allLocations.filter((l) => {
    if (isEdit && existing?.product?.locationId === l.id) return true;
    const count = l.productCount ?? l.products?.length ?? 0;
    return count === 0;
  });

  // Group locations by rack for the select
  const locationGroups = availableLocations.reduce<Record<string, typeof allLocations>>(
    (acc, l) => {
      (acc[l.rack] ||= []).push(l);
      return acc;
    },
    {}
  );

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handlePhotos = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(Boolean);
    if (list.length === 0) return;
    setPhotoUploading(true);

    // ---- INSTANT LOCAL PREVIEW for ALL files ----
    // Convert each file to a base64 data URL immediately so the user sees
    // every selected photo at once — before any upload finishes. Data URLs
    // are stable (never revoked), so no race condition with blob: URLs.
    const localPreviews: string[] = [];
    for (const file of list) {
      try {
        const dataUrl = await fileToDataUrl(file);
        localPreviews.push(dataUrl);
      } catch {
        // skip this file — can't read it
      }
    }
    if (localPreviews.length > 0) {
      setForm((f) => ({ ...f, photos: [...f.photos, ...localPreviews] }));
    }

    // ---- Upload each file SEQUENTIALLY, replace its local preview ----
    // We upload one-by-one (not in parallel) to avoid hammering the server
    // and to make it trivial to match each upload back to its local preview
    // URL for the swap. For a handful of photos this is fast enough.
    let successCount = 0;
    for (let i = 0; i < list.length; i++) {
      const local = localPreviews[i];
      if (!local) continue;
      try {
        const res = await upload.mutateAsync({ file: list[i], folder: "products" });
        // Replace THIS specific local data URL with the real server URL.
        // Matching by the local string is safe because each data URL is
        // unique (it encodes the file bytes).
        setForm((f) => ({
          ...f,
          photos: f.photos.map((p) => (p === local ? res.url : p)),
        }));
        successCount++;
      } catch {
        // Leave the local data URL in place on failure (hook shows toast)
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} photo${successCount > 1 ? "s" : ""} upload ho gayi`
      );
    }
    setPhotoUploading(false);
  };

  const handleScan = async (file: File) => {
    if (!file) return;
    setAiResult(null);
    let dataUrl = "";
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      toast.error("Image padhne mein error");
      return;
    }

    // ---- INSTANT LOCAL PREVIEW ----
    // Show the photo immediately as a base64 data URL. This way the user
    // sees their photo the moment they select it — even before AI scan
    // completes AND before upload finishes. Previously the photo area
    // stayed empty during the ~2s AI scan, which looked broken.
    setForm((f) => ({ ...f, photos: [...f.photos, dataUrl] }));

    // Persist photo to server in parallel (best-effort)
    const uploadPromise = upload
      .mutateAsync({ file, folder: "products" })
      .then((res) => res.url)
      .catch(() => "");

    recognize.mutate(
      { image: dataUrl },
      {
        onSuccess: async (resp) => {
          const rec = resp.recognized;
          if (!rec) {
            toast.error(resp.message || "AI pehchaan nahi kar paya");
            return;
          }

          // Match category by name (case-insensitive)
          const matchedCat = categories.find(
            (c) =>
              c.name.trim().toLowerCase() ===
              rec.category.trim().toLowerCase()
          );
          const categoryMatched = !!matchedCat;

          setForm((f) => ({
            ...f,
            name: rec.name || f.name,
            brand: rec.brand || f.brand,
            oemNumber: rec.oemNumber || f.oemNumber,
            bikeModels: rec.bikeModels || f.bikeModels,
            categoryId: matchedCat ? matchedCat.id : f.categoryId,
            purchasePrice:
              rec.suggestedPurchasePrice != null
                ? String(rec.suggestedPurchasePrice)
                : f.purchasePrice,
            sellingPrice:
              rec.suggestedSellingPrice != null
                ? String(rec.suggestedSellingPrice)
                : f.sellingPrice,
            notes: rec.notes || f.notes,
          }));

          // Replace the local data-URL preview with the server URL once
          // upload finishes. We match by the dataUrl string so we only
          // swap the AI-scanned photo, not any other photos the user may
          // have added in the meantime.
          const uploadedUrl = await uploadPromise;
          if (uploadedUrl) {
            setForm((f) => ({
              ...f,
              photos: f.photos.map((p) => (p === dataUrl ? uploadedUrl : p)),
            }));
          }

          setAiResult({ recognized: rec, categoryMatched });
          toast.success("AI ne product pehchan liya! Fields check kar lein.");
        },
        onError: () => {
          // toast handled in hook
        },
      }
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const body = {
      name: form.name.trim(),
      bikeModels: form.bikeModels,
      brand: form.brand,
      oemNumber: form.oemNumber,
      categoryId: form.categoryId || null,
      locationId: form.locationId || null,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      quantity: Number(form.quantity) || 0,
      minStock: Number(form.minStock) || 0,
      supplier: form.supplier,
      photo: joinPhotos(form.photos) || null,
      notes: form.notes,
      barcode: form.barcode || null,
    };

    if (isEdit && editingProductId) {
      update.mutate(
        { id: editingProductId, body },
        { onSuccess: () => go("products") }
      );
    } else {
      create.mutate(body, { onSuccess: () => go("products") });
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => go(isEdit ? "product-detail" : "products")}
        className="h-9"
      >
        <ArrowLeft className="size-4" /> Back
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {isEdit ? "Edit Product" : "Add New Product"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update product details and stock"
            : "Fill in the details below. Takes under 30 seconds."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* AI Scan — Smart Product Recognition */}
        <Card className="shadow-soft border-primary/40 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <ScanLine className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold tracking-tight">
                      AI se Scan karein
                    </h3>
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="size-3" /> Smart
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Photo kheencho, AI khud product pehchan lega aur form bhar
                    dega. 5-10 second lagenge.
                  </p>
                </div>
              </div>

              <input
                ref={scanRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleScan(f);
                  e.target.value = "";
                }}
              />

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-12 rounded-xl shadow-glow"
                  onClick={() => scanRef.current?.click()}
                  disabled={recognize.isPending}
                >
                  {recognize.isPending ? (
                    <>
                      <Loader2 className="size-5 animate-spin" /> AI pehchan
                      raha hai...
                    </>
                  ) : (
                    <>
                      <Camera className="size-5" /> 📸 AI se Scan karein
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => {
                    const inp = document.createElement("input");
                    inp.type = "file";
                    inp.accept = "image/*";
                    inp.onchange = () => {
                      const f = inp.files?.[0];
                      if (f) handleScan(f);
                    };
                    inp.click();
                  }}
                  disabled={recognize.isPending}
                >
                  <Upload className="size-5" /> Gallery se Scan
                </Button>
              </div>

              {/* AI result banner */}
              {aiResult?.recognized && (
                <div
                  className={cn(
                    "mt-3 rounded-xl border p-3 text-sm",
                    aiResult.categoryMatched
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-amber-500/40 bg-amber-500/10"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="font-medium">
                      ✅ AI result applied
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        aiResult.recognized.confidence === "high" &&
                          "border-emerald-500/50 text-emerald-600",
                        aiResult.recognized.confidence === "medium" &&
                          "border-amber-500/50 text-amber-600",
                        aiResult.recognized.confidence === "low" &&
                          "border-red-500/50 text-red-600"
                      )}
                    >
                      {aiResult.recognized.confidence} confidence
                    </Badge>
                    {!aiResult.categoryMatched && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 text-amber-600 gap-1"
                      >
                        <AlertCircle className="size-3" /> Category: "
                        {aiResult.recognized.category}" — manually select karein
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Please verify all fields before saving.
                  </p>
                </div>
              )}

              {recognize.isPending && (
                <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="size-4 animate-pulse" />
                    <span className="font-medium">
                      AI photo analyze kar raha hai... 5-10 second wait karein.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </div>
        </Card>

        {/* Photos (multiple) */}
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Product Photos</Label>
              <span className="text-xs text-muted-foreground">
                {form.photos.length} photo{form.photos.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Multiple photos upload karein — har angle se (front, back, box,
              packet). Pehli photo MAIN dikhegi.
            </p>

            {/* Photo grid */}
            {form.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {form.photos.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                  >
                    <SafeImage
                      src={src}
                      alt={`Product photo ${i + 1}`}
                      className="size-full object-cover"
                      placeholder={
                        <Package className="size-8 text-muted-foreground/40" />
                      }
                    />
                    {i === 0 && form.photos.length > 1 && (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow">
                        MAIN
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          photos: f.photos.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow hover:bg-destructive/90"
                      aria-label="Remove photo"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload buttons */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handlePhotos(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => fileRef.current?.click()}
                disabled={photoUploading}
              >
                {photoUploading ? (
                  <>
                    <Loader2 className="size-5 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Camera className="size-5" /> Take Photos
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full h-11 rounded-xl"
                onClick={() => {
                  // open file picker without capture, allow multiple
                  const inp = document.createElement("input");
                  inp.type = "file";
                  inp.accept = "image/*";
                  inp.multiple = true;
                  inp.onchange = () => {
                    if (inp.files && inp.files.length > 0) {
                      handlePhotos(inp.files);
                    }
                  };
                  inp.click();
                }}
                disabled={photoUploading}
              >
                <Upload className="size-5" /> Upload from Gallery
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Basic info */}
        <Card className="shadow-soft">
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-sm font-medium">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="mt-1 h-11 rounded-xl text-base"
                placeholder="e.g. Clutch Plate Set"
                autoFocus
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Brand</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => set("brand", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="e.g. Hero OEM"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">OEM Number</Label>
                <Input
                  value={form.oemNumber}
                  onChange={(e) => set("oemNumber", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="e.g. 26100M99R10"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Compatible Bike Models
              </Label>
              <Input
                value={form.bikeModels}
                onChange={(e) => set("bikeModels", e.target.value)}
                className="mt-1 h-11 rounded-xl"
                placeholder="comma separated: Splendor+, HF Deluxe, Passion Pro"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One part can fit multiple bikes
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Category</Label>
              <select
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <Label className="text-sm font-medium">Location (Rack-Row-Box)</Label>
            <p className="text-xs text-muted-foreground">
              Assign a shelf box so staff can find this part instantly
            </p>
            <select
              value={form.locationId}
              onChange={(e) => set("locationId", e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
            >
              <option value="">No location assigned</option>
              {Object.keys(locationGroups)
                .sort()
                .map((rack) => (
                  <optgroup key={rack} label={`Rack ${rack}`}>
                    {locationGroups[rack]
                      .sort((a, b) => a.row - b.row || a.box - b.box)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} (R{l.row}-B{l.box})
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </CardContent>
        </Card>

        {/* Pricing + stock */}
        <Card className="shadow-soft">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Purchase Price (₹)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.purchasePrice}
                  onChange={(e) => set("purchasePrice", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Selling Price (₹)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.sellingPrice}
                  onChange={(e) => set("sellingPrice", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">
                  Quantity{" "}
                  {!isEdit && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="0"
                  disabled={isEdit}
                />
                {isEdit && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use Stock In/Out to change quantity
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Minimum Stock</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.minStock}
                  onChange={(e) => set("minStock", e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="5"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier + notes */}
        <Card className="shadow-soft">
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-sm font-medium">Supplier</Label>
              <Input
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                className="mt-1 h-11 rounded-xl"
                placeholder="e.g. Hero Distributors"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Barcode (optional)</Label>
              <Input
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                className="mt-1 h-11 rounded-xl"
                placeholder="future-ready field"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="mt-1 rounded-xl"
                rows={3}
                placeholder="Any extra info for staff..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="sticky bottom-4 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            onClick={() => go(isEdit ? "product-detail" : "products")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-12 flex-1 rounded-xl shadow-glow"
            disabled={create.isPending || update.isPending}
          >
            {create.isPending || update.isPending ? (
              <>
                <Loader2 className="size-5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="size-5" /> {isEdit ? "Update" : "Add"} Product
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
