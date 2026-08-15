"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useLocations,
  useCreateLocation,
  useBulkCreateLocations,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Plus,
  ArrowLeft,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getStockStatus } from "@/lib/types";

export function LocationsView() {
  const { data, isLoading } = useLocations();
  const { highlightLocationId, openProduct, go, clearHighlight } = useUI();

  const locations = data?.locations || [];

  // Auto-scroll to + clear highlight after a few seconds
  useEffect(() => {
    if (!highlightLocationId) return;
    const el = document.getElementById(`loc-${highlightLocationId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => clearHighlight(), 5000);
    return () => clearTimeout(t);
  }, [highlightLocationId, clearHighlight]);

  // Group by rack
  const racks = useMemo(() => {
    const map: Record<string, typeof locations> = {};
    locations.forEach((l) => {
      (map[l.rack] ||= []).push(l);
    });
    Object.keys(map).forEach((r) =>
      map[r].sort((a, b) => a.row - b.row || a.box - b.box)
    );
    return map;
  }, [locations]);

  // Stats
  const stats = useMemo(() => {
    let occupied = 0,
      empty = 0,
      out = 0,
      low = 0;
    locations.forEach((l) => {
      if (!l.products || l.products.length === 0) {
        empty++;
        return;
      }
      occupied++;
      const p = l.products[0];
      const s = getStockStatus(p);
      if (s === "out") out++;
      else if (s === "low") low++;
    });
    return { occupied, empty, out, low, total: locations.length };
  }, [locations]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => go("dashboard")} className="md:hidden">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Shop Layout
            </h1>
            <p className="text-sm text-muted-foreground">
              Tap any box to see what's inside
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkGenerateButton />
          <AddLocationButton />
        </div>
      </div>

      {/* Legend */}
      <Card className="shadow-soft">
        <CardContent className="flex flex-wrap items-center gap-4 p-3">
          <LegendItem color="bg-emerald-500" label={`In Stock (${stats.occupied - stats.out - stats.low})`} />
          <LegendItem color="bg-amber-500" label={`Low Stock (${stats.low})`} />
          <LegendItem color="bg-red-500" label={`Out of Stock (${stats.out})`} />
          <LegendItem color="bg-muted-foreground/25" label={`Empty (${stats.empty})`} />
          <div className="ml-auto text-sm font-medium">
            {stats.occupied}/{stats.total} boxes used
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
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
                onOpenProduct={(pid) => openProduct(pid)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-4 rounded", color)} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function RackCard({
  rack,
  locations,
  highlightId,
  onOpenProduct,
}: {
  rack: string;
  locations: any[];
  highlightId: string | null;
  onOpenProduct: (id: string) => void;
}) {
  // group by row
  const rows: Record<number, any[]> = {};
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
                  {boxes.map((l) => {
                    const occupied = l.products && l.products.length > 0;
                    const p = occupied ? l.products[0] : null;
                    const status = p ? getStockStatus(p) : "empty";
                    const isHighlight = highlightId === l.id;

                    const color = !occupied
                      ? "bg-muted-foreground/15 border-muted-foreground/20 text-muted-foreground"
                      : status === "out"
                        ? "bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400"
                        : status === "low"
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400";

                    return (
                      <button
                        key={l.id}
                        id={`loc-${l.id}`}
                        onClick={() => occupied && onOpenProduct(p.id)}
                        disabled={!occupied}
                        className={cn(
                          "aspect-square rounded-xl border-2 p-1.5 flex flex-col items-center justify-center text-center transition-all",
                          color,
                          isHighlight && "ring-4 ring-primary ring-offset-2 ring-offset-background scale-110",
                          occupied && "hover:scale-105 hover:shadow-soft cursor-pointer"
                        )}
                      >
                        <span className="text-[10px] font-mono font-bold leading-none">
                          {l.box}
                        </span>
                        {occupied ? (
                          <span className="mt-0.5 text-[8px] leading-tight line-clamp-2 font-medium">
                            {p.name}
                          </span>
                        ) : (
                          <span className="text-[8px]">empty</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

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
        onError: (e: any) => {
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

function AddLocationButton() {
  const create = useCreateLocation();
  const { setView } = useUI();
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
                onChange={(e) => setRack(e.target.value.slice(0, 2).toUpperCase())}
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
            <Button type="submit" className="rounded-xl" disabled={create.isPending}>
              Add Box
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
