"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useBulkCreateLocations,
  useBulkDeleteLocations,
  useCreateLocation,
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
import { Checkbox } from "@/components/ui/checkbox";
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

export function LocationsView() {
  const { data, isLoading } = useLocations();
  const { highlightLocationId, openProduct, go, clearHighlight } = useUI();

  const locations = data?.locations || [];

  // ---- Search -------------------------------------------------------------
  const [search, setSearch] = useState("");
  const searchTrim = search.trim().toLowerCase();

  // ---- Bulk select --------------------------------------------------------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Drawer -------------------------------------------------------------
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // Auto-scroll to + clear highlight after a few seconds
  useEffect(() => {
    if (!highlightLocationId) return;
    const el = document.getElementById(`loc-${highlightLocationId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => clearHighlight(), 5000);
    return () => clearTimeout(t);
  }, [highlightLocationId, clearHighlight]);

  // Search filter — match against box number, code, displayLocation form,
  // and rack. "Box 27" / "box #27" / "27" all collapse to "27".
  const filtered = useMemo(() => {
    if (!searchTrim) return locations;
    const q = searchTrim.replace(/^box\s*#?\s*/i, "").trim();
    if (!q) return locations;
    return locations.filter((l) => {
      const num = String(l.box);
      const code = l.code.toLowerCase();
      return (
        num.includes(q) ||
        code.includes(q) ||
        displayLocation(l.code).toLowerCase().includes(q) ||
        l.rack.toLowerCase().includes(q)
      );
    });
  }, [locations, searchTrim]);

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

  // Grouped by rack → row (non-search view). Use the full list so the grid
  // layout stays stable while searching only changes the rendered section.
  const racks = useMemo(() => {
    const map: Record<string, Location[]> = {};
    locations.forEach((l) => {
      (map[l.rack] ||= []).push(l);
    });
    Object.keys(map).forEach((r) =>
      map[r].sort((a, b) => a.row - b.row || a.box - b.box)
    );
    return map;
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
              Shop Layout
            </h1>
            <p className="text-sm text-muted-foreground">
              Tap any box to see what&apos;s inside
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkGenerateButton />
          <AddLocationButton />
        </div>
      </div>

      {/* Search + Select toolbar */}
      <Card className="shadow-soft">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Box dhoondho... (e.g. 27, Box 27, A-1)"
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
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
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

      {/* Body */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : isSearching ? (
        <SearchResults
          results={filtered}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggle={toggleSelected}
          onOpen={(id) => setDrawerId(id)}
          highlightId={highlightLocationId}
        />
      ) : (
        <div className="space-y-4">
          {Object.keys(racks)
            .sort()
            .map((rack) => (
              <RackCard
                key={rack}
                rack={rack}
                locations={racks[rack]}
                highlightId={highlightLocationId}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggle={toggleSelected}
                onOpen={(id) => setDrawerId(id)}
              />
            ))}
        </div>
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

// ---- Rack + Tile ----------------------------------------------------------

function RackCard({
  rack,
  locations,
  highlightId,
  selectMode,
  selectedIds,
  onToggle,
  onOpen,
}: {
  rack: string;
  locations: Location[];
  highlightId: string | null;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  // Group by row
  const rows: Record<number, Location[]> = {};
  locations.forEach((l) => {
    (rows[l.row] ||= []).push(l);
  });

  return (
    <Card className="shadow-soft">
      <CardHeader className="flex-row items-center gap-3 pb-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-glow">
          {rack}
        </span>
        <div>
          <CardTitle className="text-base">Rack {rack}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {locations.length} boxes
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.keys(rows)
          .sort((a, b) => Number(a) - Number(b))
          .map((rowKey) => {
            const row = Number(rowKey);
            const boxes = rows[row];
            return (
              <div key={rowKey} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground">
                  R{row}
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 flex-1">
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
              </div>
            );
          })}
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
  const locked = selectMode && occupied; // occupied boxes can't be selected

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
      aria-label={`Box ${location.code}${
        occupied ? `, ${count} products` : ", empty"
      }`}
      className={cn(
        "relative aspect-square rounded-xl border-2 p-1.5 flex flex-col items-center justify-center text-center transition-all",
        color,
        highlight && "ring-4 ring-primary ring-offset-2 ring-offset-background scale-110",
        !selectMode && !locked && "hover:scale-105 hover:shadow-soft cursor-pointer",
        selectMode && !occupied && "cursor-pointer",
        selected && "ring-2 ring-primary border-primary",
        locked && "cursor-not-allowed opacity-70"
      )}
    >
      {/* Select-mode indicator (empty boxes only) — non-interactive span
          to avoid nesting a <button> inside a <button>. */}
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
      {/* Select-mode lock badge (occupied boxes can't be deleted) */}
      {selectMode && occupied && (
        <span
          className="absolute top-1 right-1 z-10 text-amber-500"
          aria-hidden="true"
        >
          <Lock className="size-3" />
        </span>
      )}

      <span className="text-[10px] font-mono font-bold leading-none">
        {location.box}
      </span>
      {occupied ? (
        <span className="mt-0.5 text-[8px] leading-tight font-medium">
          {count} pc
        </span>
      ) : (
        <span className="mt-0.5 text-[8px]">empty</span>
      )}
    </button>
  );
}

// ---- Search results (flat list) ------------------------------------------

function SearchResults({
  results,
  selectMode,
  selectedIds,
  onToggle,
  onOpen,
  highlightId,
}: {
  results: Location[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  highlightId: string | null;
}) {
  if (results.length === 0) {
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
      <CardContent className="p-0">
        <ScrollArea className="max-h-[60vh]">
          <ul className="divide-y">
            {results.map((l) => {
              const count = l.productCount ?? l.products?.length ?? 0;
              const occupied = count > 0;
              const selected = selectedIds.has(l.id);
              return (
                <li
                  key={l.id}
                  id={`loc-${l.id}`}
                  className={cn(
                    "flex items-center gap-3 p-3",
                    highlightId === l.id && "bg-primary/10 ring-2 ring-primary ring-inset"
                  )}
                >
                  {selectMode && (
                    <Checkbox
                      checked={selected}
                      disabled={occupied}
                      onCheckedChange={() => !occupied && onToggle(l.id)}
                      className="size-5"
                      aria-label={`Select box ${l.code}`}
                    />
                  )}
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg border-2 font-mono font-bold text-sm",
                      occupied
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted-foreground/10 border-muted-foreground/20 text-muted-foreground"
                    )}
                  >
                    {l.box}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate text-sm font-semibold">
                        {displayLocation(l.code)}
                      </p>
                      {occupied ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        >
                          {count} products
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          empty
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Rack {l.rack} · Row {l.row}
                    </p>
                  </div>
                  {!selectMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl shrink-0"
                      onClick={() => onOpen(l.id)}
                    >
                      Open <ChevronRight className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
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
            <SheetDescription>
              Rack {location.rack} · Row {location.row} · Box {location.box}
            </SheetDescription>
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
                  const label = s === "out" ? "Out" : s === "low" ? "Low" : "In";
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
                            <span className="text-sm font-bold">{p.quantity}</span>
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
    // Doing this in the open-change handler (not an effect) avoids the
    // react-hooks/set-state-in-effect lint rule.
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
            Naya box naam daalo. Numerical naam &quot;Box #N&quot; dikhega.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rename-code">Box naam</Label>
            <Input
              id="rename-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              className="mt-1 h-11 rounded-xl font-mono"
              placeholder="e.g. 27, A-1-04"
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
            Box {name} ko delete karna hai?
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
                `Box ${displayLocation(s.code)} me ${s.productCount} products hain`
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

// ---- Existing: bulk generate boxes (unchanged) ---------------------------

function BulkGenerateButton() {
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
          const d = res?.data;
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
          variant="outline"
          size="lg"
          className="h-11 rounded-xl border-primary/40 text-primary hover:bg-primary/10"
        >
          <Zap className="size-5" /> Auto-Create Boxes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Location Boxes Banayein</DialogTitle>
          <DialogDescription>
            Aapke shop ke saare storage boxes ek baar me ban jaayenge. Box
            number 1 se N tak milenge.
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
              Example: daalo <span className="font-semibold">100</span> → boxes
              <span className="font-mono"> 1</span> se
              <span className="font-mono"> 100</span> tak ban jaayenge (rack =
              BOX).
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

// ---- Existing: single add-box (unchanged) --------------------------------

function AddLocationButton() {
  const create = useCreateLocation();
  const [open, setOpen] = useState(false);
  const [rack, setRack] = useState("A");
  const [row, setRow] = useState("1");
  const [box, setBox] = useState("1");

  const code = `${rack.toUpperCase()}-${row}-${String(box).padStart(2, "0")}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { rack: rack.toUpperCase(), row: Number(row), box: Number(box) },
      {
        onSuccess: () => setOpen(false),
        onError: () => {},
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 rounded-xl shadow-glow" size="lg">
          <Plus className="size-5" /> Add Box
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Location Box</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Rack</Label>
              <Input
                value={rack}
                onChange={(e) =>
                  setRack(e.target.value.slice(0, 2).toUpperCase())
                }
                className="mt-1 h-11 rounded-xl uppercase"
                maxLength={2}
              />
            </div>
            <div>
              <Label>Row</Label>
              <Input
                type="number"
                min={1}
                value={row}
                onChange={(e) => setRow(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label>Box</Label>
              <Input
                type="number"
                min={1}
                value={box}
                onChange={(e) => setBox(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="rounded-xl bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">Location Code</p>
            <p className="text-lg font-bold font-mono text-primary">{code}</p>
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
              Add Box
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
