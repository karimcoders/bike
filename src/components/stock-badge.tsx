import { cn } from "@/lib/utils";
import { getStockStatus, type StockStatus } from "@/lib/types";

export function StockBadge({
  quantity,
  minStock,
  className,
  showLabel = true,
}: {
  quantity: number;
  minStock: number;
  className?: string;
  showLabel?: boolean;
}) {
  const status: StockStatus = getStockStatus({ quantity, minStock });
  const map = {
    out: { cls: "stock-out", label: "Out of Stock" },
    low: { cls: "stock-low", label: "Low Stock" },
    high: { cls: "stock-high", label: "In Stock" },
  } as const;
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        m.cls,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {showLabel ? m.label : quantity}
    </span>
  );
}

export function StockDot({ quantity, minStock }: { quantity: number; minStock: number }) {
  const status = getStockStatus({ quantity, minStock });
  const color =
    status === "out"
      ? "bg-red-500"
      : status === "low"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return <span className={cn("inline-block size-2.5 rounded-full", color)} />;
}

export function StatusPill({
  status,
}: {
  status: StockStatus;
}) {
  const map = {
    out: { cls: "stock-out", label: "Out" },
    low: { cls: "stock-low", label: "Low" },
    high: { cls: "stock-high", label: "OK" },
  } as const;
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        m.cls
      )}
    >
      {m.label}
    </span>
  );
}
