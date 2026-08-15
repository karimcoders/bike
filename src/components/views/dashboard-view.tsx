"use client";

import { useDashboard, useSettings } from "@/lib/queries";
import { getGreeting } from "@/lib/greeting";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import {
  Package,
  AlertTriangle,
  Plus,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingCart,
  IndianRupee,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

export function DashboardView() {
  const { data, isLoading } = useDashboard();
  const { data: settingsData } = useSettings();
  const { go, openProduct, openAddProduct, user, setFilters } = useUI();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { stats, outOfStock, lowStock, recentMovements } = data;

  // ---- 4 CORE STAT CARDS ----
  // Simplified from the previous 10+ cards (sales, payments, today, stats)
  // down to the four numbers a rural shop owner actually checks every day:
  //   1. Today's Sales (revenue)  → tap to see sales list
  //   2. Total Products           → tap to see product list
  //   3. Low Stock count          → tap to see low-stock products (filtered)
  //   4. Udhaar (outstanding)     → tap to see customers with credit
  const statCards = [
    {
      label: "Today's Sales",
      value: formatINR(stats.todayRevenue),
      sub: `${stats.todaySalesCount} sales today`,
      icon: IndianRupee,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      onClick: () => go("sales"),
    },
    {
      label: "Total Products",
      value: String(stats.totalProducts),
      sub: `${stats.totalQuantity} units in stock`,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
      onClick: () => go("products"),
    },
    {
      label: "Low Stock",
      value: String(stats.lowStockCount),
      sub: "needs restock",
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      onClick: () => {
        setFilters({ status: "low" });
        go("products");
      },
    },
    {
      label: "Udhaar",
      value: formatINR(stats.totalOutstanding),
      sub: stats.totalOutstanding > 0 ? "pending collection" : "no pending dues",
      icon: Wallet,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      onClick: () => go("customers"),
    },
  ];

  // ---- 2 PRIMARY QUICK ACTIONS ----
  // Previously 4 quick actions + a 4-button AI Shop OS card (8 buttons total).
  // Now just the two things the owner does 20 times a day: add a part, sell.
  const quickActions = [
    {
      label: "Add Part",
      icon: Plus,
      action: () => openAddProduct(),
      color: "bg-primary text-primary-foreground",
    },
    {
      label: "Sell",
      icon: ShoppingCart,
      action: () => go("sales"),
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Greeting — kept simple. The big "Dukaan Band Karein" CTA was
          removed from the dashboard; it's now reachable via Reports →
          Close Shop in the sidebar (one extra tap, far less visual noise). */}
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {getGreeting(settingsData?.settings?.ownerName)},{" "}
          {settingsData?.settings?.ownerName?.split(" ")[0] ||
            user?.name?.split(" ")[0] ||
            "Owner"}{" "}
          👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your shop summary for today
        </p>
      </div>

      {/* Quick actions — 2 primary buttons */}
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={a.action}
              className={cn(
                "flex items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:scale-[1.02] active:scale-95 touch-target",
              )}
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  a.color,
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold text-left">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4 core stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={c.onClick}
              className="text-left"
              aria-label={`${c.label} — view details`}
            >
              <Card className="shadow-soft gap-0 py-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 hover:shadow-glow h-full">
                <CardContent className="p-4 relative">
                  <ChevronRight className="absolute right-2 top-2 size-4 text-muted-foreground/50" />
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {c.label}
                      </p>
                      <p className="mt-1 text-2xl font-bold tracking-tight truncate">
                        {c.value}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {c.sub}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        c.bg,
                        c.color,
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Alerts + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Low + Out of stock alerts */}
        <Card className="shadow-soft">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              Stock Alerts
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go("products")}
              className="text-xs"
            >
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {outOfStock.length === 0 && lowStock.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Package className="mx-auto mb-2 size-8 text-emerald-500" />
                All stock levels are healthy!
              </div>
            )}
            {[...outOfStock, ...lowStock].slice(0, 8).map((p) => {
              return (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.brand} · {p.oemNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{p.quantity}</p>
                    <StockBadge
                      quantity={p.quantity}
                      minStock={p.minStock}
                      showLabel={false}
                      className="text-[10px]"
                    />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent movements */}
        <Card className="shadow-soft">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {recentMovements.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No activity yet
              </div>
            )}
            {recentMovements.map((m) => {
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
                        : "bg-red-500/10 text-red-500",
                    )}
                  >
                    {isIn ? (
                      <ArrowDownToLine className="size-4" />
                    ) : (
                      <ArrowUpFromLine className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.product?.name || "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.reason} · {m.user?.name || "System"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isIn ? "text-emerald-500" : "text-red-500",
                      )}
                    >
                      {isIn ? "+" : ""}
                      {m.quantity}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
