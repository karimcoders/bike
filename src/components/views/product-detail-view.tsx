"use client";

import { useState } from "react";
import { useProduct, useDeleteProduct } from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import {
  getBikeModels,
  getStockStatus,
  getProductPhotos,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  MapPin,
  Package,
  Pencil,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Tag,
  Bike,
  Truck,
  FileText,
  Hash,
  IndianRupee,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

export function ProductDetailView() {
  const { selectedProductId, openEditProduct, go, navigateToLocation, user } =
    useUI();
  const { data, isLoading } = useProduct(selectedProductId);
  const del = useDeleteProduct();
  const [activePhoto, setActivePhoto] = useState(0);

  const product = data?.product;

  if (isLoading || !product) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const bikes = getBikeModels(product);
  const status = getStockStatus(product);
  const movements = (product as any).movements || [];
  const isAdmin = user?.role === "ADMIN";

  // ---- Multi-image gallery ----
  // Product.photo stores comma-separated URLs. We split them into an array
  // and let the user click thumbnails to switch the main image.
  const photos = getProductPhotos(product.photo);
  const safeActive = Math.min(activePhoto, Math.max(0, photos.length - 1));
  const mainPhoto = photos[safeActive] || null;

  return (
    <div className="space-y-4">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => go("products")}
        className="h-9"
      >
        <ArrowLeft className="size-4" /> Back to Products
      </Button>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: photo + actions */}
        <Card className="shadow-soft lg:col-span-1">
          <CardContent className="p-4">
            {/* Main image */}
            <div className="aspect-square w-full overflow-hidden rounded-2xl bg-muted flex items-center justify-center">
              <SafeImage
                src={mainPhoto}
                alt={product.name}
                className="size-full object-cover"
                placeholder={<Package className="size-16 text-muted-foreground/30" />}
              />
            </div>

            {/* Thumbnail strip (only if more than 1 photo) */}
            {photos.length > 1 && (
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {photos.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg border-2 bg-muted transition-all",
                      i === safeActive
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border opacity-70 hover:opacity-100"
                    )}
                    aria-label={`View photo ${i + 1}`}
                  >
                    <SafeImage
                      src={src}
                      alt={`Thumbnail ${i + 1}`}
                      className="size-full object-cover"
                      placeholder={<Package className="size-4 text-muted-foreground/30" />}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Stock display */}
            <div className="mt-4 rounded-2xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Current Stock</p>
              <p
                className={cn(
                  "text-4xl font-bold tracking-tight",
                  status === "out"
                    ? "text-red-500"
                    : status === "low"
                      ? "text-amber-500"
                      : "text-emerald-500"
                )}
              >
                {product.quantity}
              </p>
              <p className="text-xs text-muted-foreground">
                min: {product.minStock}
              </p>
              <div className="mt-2 flex justify-center">
                <StockBadge
                  quantity={product.quantity}
                  minStock={product.minStock}
                />
              </div>
            </div>

            {/* Stock actions */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={() => go("stock-in")}
                className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ArrowDownToLine className="size-5" /> Stock In
              </Button>
              <Button
                onClick={() => go("stock-out")}
                variant="outline"
                className="h-12 rounded-xl border-red-500/30 text-red-600 hover:bg-red-500/10"
                disabled={product.quantity <= 0}
              >
                <ArrowUpFromLine className="size-5" /> Stock Out
              </Button>
            </div>

            {product.location && (
              <Button
                onClick={() => navigateToLocation(product.locationId!)}
                className="mt-2 h-12 w-full rounded-xl"
                size="lg"
              >
                <MapPin className="size-5" /> Navigate to Location
              </Button>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                onClick={() => openEditProduct(product.id)}
                variant="outline"
                className="h-11 rounded-xl"
              >
                <Pencil className="size-4" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border-red-500/30 text-red-600 hover:bg-red-500/10"
                    disabled={!isAdmin}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete product?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{product.name}" and all its
                      inventory history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        del.mutate(product.id, {
                          onSuccess: () => go("products"),
                        });
                      }}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {!isAdmin && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Only admin can delete products
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right: details + history */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                    {product.name}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {product.brand}
                    {product.oemNumber && ` · OEM ${product.oemNumber}`}
                  </p>
                </div>
                {product.category && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: (product.category.color || "#f97316") + "22",
                      color: product.category.color || "#f97316",
                    }}
                  >
                    <Tag className="size-3" />
                    {product.category.name}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {product.location && (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MapPin className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Location Code
                      </p>
                      <p className="text-sm font-bold font-mono">
                        {product.location.code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Rack {product.location.rack} · Row{" "}
                    {product.location.row} · Box {product.location.box}
                  </div>
                </div>
              )}
              <InfoRow
                icon={Bike}
                label="Compatible Bikes"
                value={
                  bikes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {bikes.map((b) => (
                        <span
                          key={b}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoRow icon={Hash} label="OEM Number" value={product.oemNumber} />
              <InfoRow icon={Tag} label="Brand" value={product.brand} />
              <InfoRow
                icon={Truck}
                label="Supplier"
                value={product.supplier}
              />
              <div className="grid grid-cols-2 gap-2 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <IndianRupee className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Selling Price
                    </p>
                    <p className="text-sm font-bold">
                      ₹{product.sellingPrice.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <IndianRupee className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Purchase Price
                    </p>
                    <p className="text-sm font-bold">
                      ₹{product.purchasePrice.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </div>
              {product.barcode && (
                <InfoRow icon={Hash} label="Barcode" value={product.barcode} />
              )}
              {product.notes && (
                <InfoRow
                  icon={FileText}
                  label="Notes"
                  value={product.notes}
                />
              )}
            </CardContent>
          </Card>

          {/* Inventory history */}
          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-primary" />
                Inventory History
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {movements.length} records
              </span>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto scroll-thin">
              {movements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No movement recorded yet
                </p>
              ) : (
                <div className="space-y-2">
                  {movements.map((m: any) => {
                    const isIn = m.quantity > 0;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border border-border p-3"
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            isIn
                              ? "bg-emerald-500/10 text-emerald-500"
                              : m.type === "ADJUSTED"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {isIn ? (
                            <ArrowDownToLine className="size-4" />
                          ) : m.type === "ADJUSTED" ? (
                            <AlertCircle className="size-4" />
                          ) : (
                            <ArrowUpFromLine className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {m.reason}
                            {m.note && (
                              <span className="text-muted-foreground">
                                {" · "}
                                {m.note}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.user?.name || "System"} ·{" "}
                            {format(new Date(m.createdAt), "dd MMM yyyy, h:mm a")}
                          </p>
                        </div>
                        <p
                          className={cn(
                            "text-sm font-bold",
                            isIn
                              ? "text-emerald-500"
                              : "text-red-500"
                          )}
                        >
                          {isIn ? "+" : ""}
                          {m.quantity}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
