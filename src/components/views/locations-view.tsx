"use client";

// =============================================================================
// LocationsView — SIMPLE NUMBERED BOXES ONLY
// -----------------------------------------------------------------------------
// The owner has N storage boxes in their shop. They enter N once (e.g. 100)
// and the app creates Box 1, Box 2, ... Box 100. That's it. No racks, no
// rows, no sections, no warehouses, no capacity limits.
//
// ONE BOX CAN HOLD MULTIPLE PRODUCTS. This is non-negotiable for a bike
// parts shop — Box 27 might hold Brake Shoe + Clutch Cable + Oil Filter +
// Spark Plug together. The productCount next to each box is INFORMATION
// ONLY; it never disables the box from being selected in the product form.
//
// Layout:
//   [Header: "Storage Locations" + Create Boxes button]
//   [Search bar + bulk-select toggle]
//   [Stats: occupied / empty / total]
//   [Grid: Box 1 (0), Box 2 (3), Box 3 (0), ... Box N (X)  -- flat, sorted by N]
//   [Click a box → drawer with products inside + rename + delete]
//
// Delete rules:
//   - Empty box → delete allowed (with confirm)
//   - Occupied box → delete BLOCKED, show "Box N me X products hain"
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useBulkCreateLocations,
  useBulkDeleteLocations,
  useDeleteLocation,
  useLocationProducts,
  useLocations,
  useUpdateLocation,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronRight,
  Loader2,
  Lock,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  displayLocation,
  getStockStatus,
  type Location,
} from "@/lib/types";

// ---- Helpers ---------------------------------------------------------------

// Derive a numeric "box number" for sorting + display. The simple-mode bulk
// create sets `code = String(N)` and `box = N`. Old rack-style codes ("A-1-04")
// won't match the numeric regex, so we fall back to the raw `box` field and
// finally to the code itself. This keeps old + new data sortable in one view.
function boxNumber(l: Location): number {
  if (/^\d+$/.test(l.code)) return Number(l.code);
  if (typeof l.box === "number") return l.box;
  return 0;
}

// What to show inside the tile (the big number/text).
function boxLabel(l: Location): string {
  if (/^\d+$/.test(l.code)) return l.code;
  return l.code;
}

export function LocationsView() {
  const { data, isLoading } = useLocations();
  const { highlightLocationId, openProduct, go, clearHighlight } = useUI();

  const locations = data?.locations || [];

  // ---- Search -------------------------------------------------------------
  const [search, setSearch] = useState("");
  const searchTrim = search.trim().toLowerCase();

  // ---- Bulk select (only empty boxes can be selected for delete) ---------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Drawer (box detail) -----------------------------------------------
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // Auto-scroll to + clear highlight after a few seconds
  useEffect(() => {
    if (!highlightLocationId) return;
    const el = document.getElementById(`loc-${highlightLocationId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => clearHighlight(), 5000);
    return () => clearTimeout(t);
  }, [highlightLocationId, clearHighlight]);

  // Sort all boxes by their numeric N (Box 1, Box 2, ..., Box 100). Old
  // rack-style codes get a high fallback number so they sink to the bottom
  // of the list (the owner will eventually delete them via cleanup).
  const sorted = useMemo(() => {
    return [...locations].sort((a, b) => boxNumber(a) - boxNumber(b));
  }, [locations]);

  // Search filter — match against box number / displayLocation text.
  // "Box 27" / "box #27" / "27" all collapse to "27".
  const filtered = useMemo(() => {
    if (!searchTrim) return sorted;
    const q = searchTrim.replace(/^box\s*#?\s*/i, "").trim();
    if (!q) return sorted;
    return sorted.filter((l) => {
      const num = String(boxNumber(l));
      const code = l.code.toLowerCase();
      return (
        num.includes(q) ||
        code.includes(q) ||
        displayLocation(l.code).toLowerCase().includes(q)
      );
    });
  }, [sorted, searchTrim]);

  const isSearching = searchTrim.length > 0;

  // Stats — count-only (no product joins). Occupied = productCount > 0.
  const stats = useMemo(() => {
    let occupied = 0;
    locations.forEach((l) => {
      const c = l.productCount ?? l.products?.length ?? 0;
      if (c > 0) occupied++;
    });
    return {
      occupied,
      empty: locations.length - occupied,
      total: locations.length,
    };
  }, [locations]);

  // Selection helpers
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedCount = selectedIds.size;

  // Look up the location currently opened in the drawer from the cached list
  // so the header stays in sync after rename / refetches.
  const drawerLocation = useMemo(
    () => locations.find((l) => l.id === drawerId) || null,
    [locations, drawerId]
  );

  // Empty-state: no boxes exist yet. Show a prominent CTA to create N boxes.
  const showEmptyState = !isLoading && locations.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go("dashboard")}
            className="md:hidden"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Storage Locations
            </h1>
            <p className="text-sm text-muted-foreground">
              {locations.length === 0
                ? "Pehle apne boxes banao (Box 1 se Box N tak)"
                : "Tap any box to see what's inside"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CreateBoxesButton />
          <AddSingleBoxButton />
        </div>
      </div>

      {/* Empty state — no boxes yet */}
      {showEmptyState ? (
        <Card className="shadow-soft">
          <CardContent className="p-8 text-center">
            <Package className="size-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-base font-semibold">Abhi koi box nahi hai</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Aapke shop me kitne storage boxes hain? Number daalo aur sab boxes
              ek baar me ban jaayenge.
            </p>
            <CreateBoxesButton large />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search + Select toolbar */}
          <Card className="shadow-soft">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Box dhoondho... (e.g. 27, Box 27)"
                  className="pl-9 pr-9 h-11 rounded-xl"
                  aria-label="Search boxes"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant={selectMode ? "default" : "outline"}
                size="lg"
                className="h-11 rounded-xl"
                onClick={() =>
                  selectMode ? exitSelectMode() : setSelectMode(true)
                }
              >
                {selectMode ? (
                  <CheckSquare className="size-4" />
                ) : (
                  <Square className="size-4" />
                )}
                {selectMode ? "Done" : "Select"}
              </Button>
              {selectMode && selectedCount > 0 && (
                <BulkDeleteButton
                  count={selectedCount}
                  ids={Array.from(selectedIds)}
                  onDone={exitSelectMode}
                />
              )}
            </CardContent>
          </Card>

          {/* Legend / stats */}
          <Card className="shadow-soft">
            <CardContent className="flex flex-wrap items-center gap-4 p-3">
              <LegendItem
                color="bg-emerald-500"
                label={`Occupied (${stats.occupied})`}
              />
              <LegendItem
                color="bg-muted-foreground/25"
                label={`Empty (${stats.empty})`}
              />
              <div className="ml-auto text-sm font-medium">
                {stats.occupied}/{stats.total} boxes used
              </div>
              {isSearching && (
                <div className="ml-2 text-xs text-muted-foreground">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Body — flat grid of all boxes sorted by N */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          ) : (
            <BoxGrid
              boxes={filtered}
              highlightId={highlightLocationId}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
              onOpen={(id) => setDrawerId(id)}
            />
          )}
        </>
      )}

      {/* Box detail drawer */}
      <BoxDetailDrawer
        location={drawerLocation}
        open={!!drawerId}
        onOpenChange={(o) => !o && setDrawerId(null)}
        onOpenProduct={(pid) => {
          setDrawerId(null);
          openProduct(pid);
        }}
      />
    </div>
  );
}

// ---- Legend ---------------------------------------------------------------

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-4 rounded", color)} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

// ---- Flat box grid (no rack grouping) -------------------------------------

function BoxGrid({
  boxes,
  highlightId,
  selectMode,
  selectedIds,
  onToggle,
  onOpen,
}: {
  boxes: Location[];
  highlightId: string | null;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (boxes.length === 0) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Package className="size-10 mx-auto mb-2 opacity-30" />
          Koi box nahi mila
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="shadow-soft">
      <CardContent className="p-4">
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2">
          {boxes.map((l) => (
            <BoxTile
              key={l.id}
              location={l}
              highlight={highlightId === l.id}
              selectMode={selectMode}
              selected={selectedIds.has(l.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BoxTile({
  location,
  highlight,
  selectMode,
  selected,
  onToggle,
  onOpen,
}: {
  location: Location;
  highlight: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const count = location.productCount ?? location.products?.length ?? 0;
  const occupied = count > 0;
  const locked = selectMode && occupied; // occupied boxes can't be bulk-deleted

  const color = !occupied
    ? "bg-muted-foreground/10 border-muted-foreground/20 text-muted-foreground"
    : "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400";

  const handleClick = () => {
    if (selectMode) {
      if (!occupied) onToggle(location.id);
      return;
    }
    onOpen(location.id);
  };

  return (
    <button
      id={`loc-${location.id}`}
      type="button"
      onClick={handleClick}
      disabled={locked}
      aria-label={`Box ${boxLabel(location)}${
        occupied ? `, ${count} products` : ", empty"
      }`}
      title={displayLocation(location.code)}
      className={cn(
        "relative aspect-square rounded-xl border-2 p-1.5 flex flex-col items-center justify-center text-center transition-all",
        color,
        highlight &&
          "ring-4 ring-primary ring-offset-2 ring-offset-background scale-110",
        !selectMode && !locked && "hover:scale-105 hover:shadow-soft cursor-pointer",
        selectMode && !occupied && "cursor-pointer",
        selected && "ring-2 ring-primary border-primary",
        locked && "cursor-not-allowed opacity-70"
      )}
    >
      {/* Select-mode checkbox (empty boxes only) */}
      {selectMode && !occupied && (
        <span
          className={cn(
            "absolute top-1 left-1 z-10 size-4 rounded-[4px] border-2 flex items-center justify-center",
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-background border-input"
          )}
          aria-hidden="true"
        >
          {selected && <Check className="size-3" />}
        </span>
      )}
      {/* Select-mode lock badge (occupied boxes can't be bulk-deleted) */}
      {selectMode && occupied && (
        <span
          className="absolute top-1 right-1 z-10 text-amber-500"
          aria-hidden="true"
        >
          <Lock className="size-3" />
        </span>
      )}

      <span className="text-base font-bold leading-none">
        {boxLabel(location)}
      </span>
      {occupied ? (
        <span className="mt-1 text-[10px] leading-tight font-medium">
          {count} pc{count > 1 ? "s" : ""}
        </span>
      ) : (
        <span className="mt-1 text-[9px] leading-tight">empty</span>
      )}
    </button>
  );
}

// ---- Box detail drawer ---------------------------------------------------

function BoxDetailDrawer({
  location,
  open,
  onOpenChange,
  onOpenProduct,
}: {
  location: Location | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenProduct: (id: string) => void;
}) {
  // Fetch the full product list ONLY for the opened box.
  const { data, isLoading: productsLoading } = useLocationProducts(
    open ? location?.id ?? null : null
  );

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!location) return null;

  const detail = data?.location;
  const products = detail?.products || [];
  const listCount = location.productCount ?? 0;
  // The drawer header uses the count from the cached LIST response so the
  // "Delete disabled?" decision is correct even before the detail loads.
  const hasProducts = listCount > 0 || products.length > 0;
  const shownCount = listCount || products.length;

  // When the Sheet closes, also dismiss any open sub-dialog so we don't
  // leave a stale rename/delete dialog open over a closed drawer.
  const handleSheetOpenChange = (o: boolean) => {
    if (!o) {
      setRenameOpen(false);
      setDeleteOpen(false);
    }
    onOpenChange(o);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <PackageOpen className="size-5 text-primary" />
              {displayLocation(location.code)}
            </SheetTitle>
            <SheetDescription>Storage Box</SheetDescription>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant={hasProducts ? "secondary" : "outline"}>
                {hasProducts ? `${shownCount} products` : "Empty"}
              </Badge>
            </div>
          </SheetHeader>

          {/* Product list */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-semibold mb-2">Products inside</h3>
            {productsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
                <Package className="size-8 mx-auto mb-2 opacity-30" />
                Koi product nahi hai
              </div>
            ) : (
              <ul className="space-y-2">
                {products.map((p) => {
                  const s = getStockStatus(p);
                  const badge =
                    s === "out"
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : s === "low"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
                  const label =
                    s === "out" ? "Out" : s === "low" ? "Low" : "In";
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpenProduct(p.id)}
                        className="w-full text-left rounded-xl border p-3 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.brand ? `${p.brand} · ` : ""}
                              {p.oemNumber ? p.oemNumber : "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold">
                              {p.quantity}
                            </span>
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                badge
                              )}
                            >
                              {label}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {hasProducts && (
              <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300">
                Box me {shownCount} products rakhe hain. Delete karne se pehle
                products doosre box me move karein.
              </div>
            )}
          </div>

          {/* Footer actions */}
          <SheetFooter className="border-t p-4 flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setRenameOpen(true)}
            >
              <Pencil className="size-4" /> Rename
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1 inline-block">
                  <Button
                    variant="destructive"
                    className="w-full rounded-xl disabled:opacity-60"
                    disabled={hasProducts}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </span>
              </TooltipTrigger>
              {hasProducts && (
                <TooltipContent>
                  Box me {shownCount} products hain — pehle move karein
                </TooltipContent>
              )}
            </Tooltip>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        location={location}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        location={location}
        onDone={() => onOpenChange(false)}
      />
    </>
  );
}

// ---- Rename dialog --------------------------------------------------------

function RenameDialog({
  open,
  onOpenChange,
  location,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location: Location;
}) {
  const update = useUpdateLocation();
  const [code, setCode] = useState(location.code);

  const handleOpenChange = (o: boolean) => {
    // Re-seed the input with the current code each time the dialog opens.
    if (o) setCode(location.code);
    onOpenChange(o);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const newCode = code.trim();
    if (!newCode) {
      toast.error("Box ka naam khaali nahi ho sakta");
      return;
    }
    if (newCode === location.code) {
      onOpenChange(false);
      return;
    }
    update.mutate(
      { id: location.id, body: { code: newCode } },
      {
        onSuccess: () => {
          toast.success("Box rename ho gaya");
          onOpenChange(false);
        },
        onError: (e: { message?: string }) => {
          toast.error(e?.message || "Ye naam pehle se kisi aur box ka hai");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Box Rename Karein</DialogTitle>
          <DialogDescription>
            Naya box number ya naam daalo. Numeric naam &quot;Box N&quot;
            dikhega.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rename-code">Box naam / number</Label>
            <Input
              id="rename-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              className="mt-1 h-11 rounded-xl font-mono"
              placeholder="e.g. 27, 28, 100"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Preview:{" "}
              <span className="font-semibold">
                {displayLocation(code.trim() || location.code)}
              </span>
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-xl">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Single-delete confirmation ------------------------------------------

function DeleteConfirmDialog({
  open,
  onOpenChange,
  location,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location: Location;
  onDone: () => void;
}) {
  const del = useDeleteLocation();
  const name = displayLocation(location.code);

  const confirm = () => {
    del.mutate(location.id, {
      onSuccess: () => {
        toast.success("Box delete ho gaya");
        onOpenChange(false);
        onDone();
      },
      onError: (e: { message?: string }) => {
        toast.error(e?.message || "Box delete nahi ho saka");
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {name} ko delete karna hai?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ye box khaali hai. Delete karne ke baad ye wapas nahi aayega. Agar
            isme products hain to pehle unhe doosre box me move karein.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl" disabled={del.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            onClick={confirm}
            disabled={del.isPending}
          >
            {del.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Bulk-delete button + confirmation -----------------------------------

function BulkDeleteButton({
  count,
  ids,
  onDone,
}: {
  count: number;
  ids: string[];
  onDone: () => void;
}) {
  const bulk = useBulkDeleteLocations();
  const [open, setOpen] = useState(false);

  const confirm = () => {
    bulk.mutate(ids, {
      onSuccess: (res) => {
        const deleted = res?.deleted ?? 0;
        const skipped = res?.skipped ?? [];
        toast.success(`${deleted} boxes delete ho gaye`);
        if (skipped.length > 0) {
          const list = skipped
            .map(
              (s) =>
                `${displayLocation(s.code)} me ${s.productCount} products hain`
            )
            .join("\n");
          toast.warning(`Ye boxes skip hue:\n${list}`, { duration: 6000 });
        }
        setOpen(false);
        onDone();
      },
      onError: (e: { message?: string }) => {
        toast.error(e?.message || "Boxes delete nahi ho sake");
      },
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="h-11 rounded-xl"
        onClick={() => setOpen(true)}
        disabled={bulk.isPending}
      >
        {bulk.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
        Delete Selected ({count})
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{count} boxes delete karein?</AlertDialogTitle>
            <AlertDialogDescription>
              Sirf khaali boxes delete honge. Agar kisi box me products hain to
              wo skip ho jaayega aur products surakshit rahenge.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={bulk.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              onClick={confirm}
              disabled={bulk.isPending}
            >
              {bulk.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Bulk create N numbered boxes (Box 1 ... Box N) ----------------------
// This is the PRIMARY way the owner sets up their shop. They enter N (e.g.
// 100) and we create Box 1 through Box 100 in one shot via the bulk API.
// Idempotent: re-running with the same N skips boxes that already exist.

function CreateBoxesButton({ large = false }: { large?: boolean }) {
  const bulk = useBulkCreateLocations();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("100");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("1 se 1000 ke beech number daalo");
      return;
    }
    bulk.mutate(
      { count: n, mode: "simple" },
      {
        onSuccess: (res) => {
          const d = res;
          if (d) {
            toast.success(
              `${d.created} boxes create ho gaye!${
                d.skipped > 0 ? ` (${d.skipped} pehle se the)` : ""
              }`
            );
          } else {
            toast.success("Boxes create ho gaye!");
          }
          setOpen(false);
          setCount("100");
        },
        onError: (e: { message?: string }) => {
          toast.error(e?.message || "Boxes create nahi ho sake");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={large ? "default" : "outline"}
          size="lg"
          className={cn(
            "h-11 rounded-xl",
            large ? "shadow-glow px-8" : "border-primary/40 text-primary hover:bg-primary/10"
          )}
        >
          <Zap className="size-5" /> Create Boxes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Storage Boxes Banayein</DialogTitle>
          <DialogDescription>
            Aapke shop ke saare storage boxes ek baar me ban jaayenge. Box 1 se
            Box N tak milenge. Ek box me multiple products rakh sakte hain.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="bulk-count">
              Aapke shop me kitne storage boxes hain?
            </Label>
            <Input
              id="bulk-count"
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="100"
              className="mt-1 h-12 rounded-xl text-lg font-semibold"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Example: daalo <span className="font-semibold">100</span> →{" "}
              <span className="font-mono">Box 1</span> se{" "}
              <span className="font-mono">Box 100</span> tak ban jaayenge.
            </p>
          </div>
          <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Idempotent hai</p>
            <p className="mt-0.5">
              Agar kuch boxes pehle se ban rakhe hain to wo skip ho jaayenge —
              dobara se dabaane se koi issue nahi.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-xl">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={bulk.isPending}
            >
              {bulk.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Add a single extra box (beyond the bulk-created range) --------------
// Useful when the owner already created Box 1..100 but later buys box #101.
// We just create a single box with the next number (or any number the owner
// types). Internally it re-uses the bulk endpoint with count=1 — but the
// "simple" mode always picks numbers 1..N, which would clash with existing
// boxes. So we use the single POST /api/locations endpoint with rack="BOX"
// to keep the data shape consistent.

function AddSingleBoxButton() {
  const create = useCreateLocation();
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("101");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(num);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Sahi number daalo (1 se zyada)");
      return;
    }
    create.mutate(
      // Simple mode: creates code=String(N), rack="BOX", row=1, box=N.
      // The API returns a friendly error if Box N already exists.
      { number: n },
      {
        onSuccess: () => {
          toast.success(`Box ${n} add ho gaya`);
          setOpen(false);
        },
        onError: (e: { message?: string }) => {
          toast.error(e?.message || "Box add nahi hua");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className="h-11 rounded-xl"
          title="Ek single box add karein"
        >
          <Plus className="size-5" /> Add Box
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Single Box Add Karein</DialogTitle>
          <DialogDescription>
            Ek extra box add karne ke liye number daalo. Example: agar aapke
            paas Box 1..100 hain aur naya Box 101 chahiye, to 101 daalo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="add-num">Box number</Label>
            <Input
              id="add-num"
              type="number"
              min={1}
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="mt-1 h-11 rounded-xl font-mono"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Preview:{" "}
              <span className="font-semibold">
                {displayLocation(num.trim() || "?")}
              </span>
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-xl">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add Box
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
