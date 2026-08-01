"use client";

import { useDashboard, useSettings } from "@/lib/queries";
import { getGreeting } from "@/lib/greeting";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import { getBikeModels, getStockStatus } from "@/lib/types";
import {
  Package,
  AlertTriangle,
  PackageX,
  Tags,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  MapPin,
  Clock,
  Boxes,
  Bot,
  Sparkles,
  ShoppingCart,
  ScanLine,
  Mic,
  Brain,
  IndianRupee,
  ChevronRight,
  Power,
  AlertCircle,
  Wallet,
  Banknote,
  Smartphone,
  CreditCard,
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
  const { go, openProduct, openAddProduct, navigateToLocation, user, setFilters } =
    useUI();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { stats, outOfStock, lowStock, recentProducts, recentMovements } = data;

  // Stat cards — each clickable to its filtered view
  const statCards = [
    {
      label: "Total Products",
      value: stats.totalProducts,
      sub: `${stats.totalQuantity} units in stock`,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
      onClick: () => go("products"),
    },
    {
      label: "Low Stock",
      value: stats.lowStockCount,
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
      label: "Out of Stock",
      value: stats.outOfStockCount,
      sub: "unavailable",
      icon: PackageX,
      color: "text-red-500",
      bg: "bg-red-500/10",
      onClick: () => {
        setFilters({ status: "out" });
        go("products");
      },
    },
    {
      label: "Categories",
      value: stats.categories,
      sub: `${stats.locations} location slots`,
      icon: Tags,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      onClick: () => go("categories"),
    },
  ];

  // Today summary cards — each clickable to relevant view
  const todayCards = [
    {
      label: "Stock In Today",
      value: String(stats.stockInToday),
      icon: ArrowDownToLine,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      onClick: () => go("stock-in"),
    },
    {
      label: "Stock Out Today",
      value: String(stats.stockOutToday),
      icon: ArrowUpFromLine,
      color: "text-red-500",
      bg: "bg-red-500/10",
      onClick: () => go("stock-out"),
    },
    {
      label: "Stock Value",
      value: formatINR(stats.stockValue),
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
      onClick: () => go("reports"),
    },
    {
      label: "Slots Used",
      value: `${stats.occupiedLocations}/${stats.locations}`,
      icon: Boxes,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      onClick: () => go("locations"),
    },
  ];

  // Today's sales summary cards — clickable
  const salesCards = [
    {
      label: "Aaj ki Bikri",
      value: String(stats.todaySalesCount),
      sub: "sales today",
      icon: ShoppingCart,
      color: "text-primary",
      onClick: () => go("sales"),
    },
    {
      label: "Aaj ka Revenue",
      value: formatINR(stats.todayRevenue),
      sub: "total sales",
      icon: IndianRupee,
      color: "text-emerald-500",
      onClick: () => go("sales"),
    },
    {
      label: "Aaj ka Profit",
      value: formatINR(stats.todayProfit),
      sub: "net profit",
      icon: TrendingUp,
      color: "text-amber-500",
      onClick: () => go("reports"),
    },
  ];

  // Payment mode breakdown mini-cards (today)
  const paymentCards = [
    {
      label: "Cash",
      value: stats.todayCashTotal,
      icon: Banknote,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      onClick: () => go("sales"),
    },
    {
      label: "UPI",
      value: stats.todayUpiTotal,
      icon: Smartphone,
      color: "text-primary",
      bg: "bg-primary/10",
      onClick: () => go("sales"),
    },
    {
      label: "Credit (Udhaar)",
      value: stats.todayCreditTotal,
      icon: CreditCard,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      onClick: () => go("customers"),
    },
  ];

  const quickActions = [
    {
      label: "Add Product",
      icon: Plus,
      view: () => openAddProduct(),
      color: "bg-primary text-primary-foreground",
    },
    {
      label: "Stock In",
      icon: ArrowDownToLine,
      view: () => go("stock-in"),
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Stock Out",
      icon: ArrowUpFromLine,
      view: () => go("stock-out"),
      color: "bg-red-500/15 text-red-600 dark:text-red-400",
    },
    {
      label: "Find Part",
      icon: MapPin,
      view: () => go("products"),
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Greeting + Close Shop CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {getGreeting(settingsData?.settings?.ownerName)}, {settingsData?.settings?.ownerName?.split(" ")[0] || user?.name?.split(" ")[0] || "Owner"} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s your shop summary for today
          </p>
        </div>
        <button
          onClick={() => go("close-shop")}
          className={cn(
            "group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 px-5 py-3 text-primary-foreground shadow-glow transition-all hover:scale-[1.02] active:scale-95 touch-target"
          )}
        >
          <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent" />
          <span className="relative flex size-9 items-center justify-center rounded-xl bg-white/20">
            <Power className="size-5" />
          </span>
          <span className="relative text-left">
            <span className="block text-sm font-bold leading-tight">
              Dukaan Band Karein
            </span>
            <span className="block text-[11px] text-primary-foreground/80">
              AI aapki aaj ki report banayega
            </span>
          </span>
        </button>
      </div>

      {/* Outstanding banner */}
      {stats.totalOutstanding > 0 && (
        <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-500/5 shadow-soft py-0">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                Udhaar (Credit) Pending: {formatINR(stats.totalOutstanding)}
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                Customers se payment collect karna baaki hai
              </p>
            </div>
            <Button
              onClick={() => go("customers")}
              className="bg-amber-500 text-white hover:bg-amber-600 shadow-soft"
              size="sm"
            >
              <AlertCircle className="size-4" />
              Collect Karein
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={a.view}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:scale-[1.02] active:scale-95",
                "touch-target"
              )}
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  a.color
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold text-left">
                {a.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* AI Shop OS feature cards */}
      <Card className="shadow-glow border-primary/20 overflow-hidden py-0">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold">AI Shop OS — ShopMitra</p>
              <p className="text-[11px] text-muted-foreground">AI aapka kaam aasaan karega</p>
            </div>
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              POWERED BY AI
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <button
              onClick={() => go("ai-assistant")}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-soft touch-target"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-4" />
              </span>
              <span className="text-xs font-semibold">ShopMitra Chat</span>
              <span className="text-[10px] text-muted-foreground">Pucho jo bhi jaanna ho</span>
            </button>
            <button
              onClick={() => go("ai-insights")}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-soft touch-target"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Sparkles className="size-4" />
              </span>
              <span className="text-xs font-semibold">AI Insights</span>
              <span className="text-[10px] text-muted-foreground">Purchase list & predictions</span>
            </button>
            <button
              onClick={() => go("products")}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-soft touch-target"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Mic className="size-4" />
              </span>
              <span className="text-xs font-semibold">Voice Search</span>
              <span className="text-[10px] text-muted-foreground">Bolo kya chahiye</span>
            </button>
            <button
              onClick={() => openAddProduct()}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-soft touch-target"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <ScanLine className="size-4" />
              </span>
              <span className="text-xs font-semibold">Photo Scan</span>
              <span className="text-[10px] text-muted-foreground">Photo se product pehchano</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Today's sales summary */}
      <div className="grid grid-cols-3 gap-3">
        {salesCards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={c.onClick}
              className="text-left"
              aria-label={`${c.label} — view details`}
            >
              <Card className="shadow-soft py-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 hover:shadow-glow h-full">
                <CardContent className="p-4 relative">
                  <ChevronRight className="absolute right-2 top-2 size-4 text-muted-foreground/50" />
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("size-4", c.color)} />
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                  <p className="text-2xl font-bold truncate">{c.value}</p>
                  <p className="text-[11px] text-muted-foreground">{c.sub}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Today's sales payment breakdown */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Aaj ki Payment Mode Breakdown
        </p>
        <div className="grid grid-cols-3 gap-3">
          {paymentCards.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.label}
                onClick={c.onClick}
                className="text-left"
                aria-label={`${c.label} — view sales`}
              >
                <Card className="shadow-soft py-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 hover:shadow-glow h-full">
                  <CardContent className="p-4 relative">
                    <ChevronRight className="absolute right-2 top-2 size-4 text-muted-foreground/50" />
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-lg",
                          c.bg,
                          c.color
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                    </div>
                    <p className="text-xl font-bold truncate">
                      {formatINR(c.value)}
                    </p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
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
                      <p className="mt-1 text-3xl font-bold tracking-tight truncate">
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
                        c.color
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

      {/* Today summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {todayCards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={c.onClick}
              className="text-left"
              aria-label={`${c.label} — view details`}
            >
              <Card className="shadow-soft py-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 hover:shadow-glow h-full">
                <CardContent className="flex items-center gap-3 p-4 relative">
                  <ChevronRight className="absolute right-2 top-2 size-4 text-muted-foreground/50" />
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      c.bg,
                      c.color
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-xl font-bold truncate">{c.value}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Alerts + Recent */}
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
              const status = getStockStatus(p);
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
                        : "bg-red-500/10 text-red-500"
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
                        isIn ? "text-emerald-500" : "text-red-500"
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

      {/* Recently added products */}
      <Card className="shadow-soft">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recently Added Products</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go("products")}
            className="text-xs"
          >
            View all
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => openProduct(p.id)}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
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
                    {getBikeModels(p).slice(0, 2).join(", ") || p.brand}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StockBadge
                      quantity={p.quantity}
                      minStock={p.minStock}
                      showLabel={false}
                      className="text-[10px]"
                    />
                    {p.location && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                        <MapPin className="size-3" />
                        {p.location.code}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
