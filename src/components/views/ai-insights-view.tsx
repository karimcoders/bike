"use client";

import { useState } from "react";
import { useAIInsights } from "@/lib/queries";
import { useUI } from "@/lib/store";
import type { AIInsights } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ShoppingCart,
  Skull,
  TrendingUp,
  Lightbulb,
  RefreshCw,
  Brain,
  AlertTriangle,
  Package,
  Clock,
  Loader2,
  ChevronRight,
} from "lucide-react";

type TabKey = "purchase" | "dead" | "predictions" | "recommendations";

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "abhi abhi";
  if (m < 60) return `${m} min pehle`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ghante pehle`;
  const d2 = Math.floor(h / 24);
  return `${d2} din pehle`;
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

export function AIInsightsView() {
  const { data, isLoading, isError, refetch, isFetching } = useAIInsights();
  const { openProduct } = useUI();
  const [tab, setTab] = useState<TabKey>("purchase");

  const tabs: {
    key: TabKey;
    label: string;
    icon: typeof ShoppingCart;
    count: number;
    color: string;
  }[] = [
    {
      key: "purchase",
      label: "Khareedne ki List",
      icon: ShoppingCart,
      count: data?.purchaseList?.length ?? 0,
      color: "text-primary",
    },
    {
      key: "dead",
      label: "Bikta nahi",
      icon: Skull,
      count: data?.deadStock?.length ?? 0,
      color: "text-muted-foreground",
    },
    {
      key: "predictions",
      label: "Bhavishyavani",
      icon: TrendingUp,
      count: data?.predictions?.length ?? 0,
      color: "text-emerald-500",
    },
    {
      key: "recommendations",
      label: "Sujhav",
      icon: Lightbulb,
      count: data?.recommendations?.length ?? 0,
      color: "text-amber-500",
    },
  ];

  // -------- Initial loading state (AI processing) --------
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            <Sparkles className="size-6 text-primary" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            AI ne aapki dukaan analyze ki
          </p>
        </div>

        <Card className="shadow-soft overflow-hidden border-primary/30 py-0">
          <CardContent className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="relative">
                <Brain className="size-14 animate-pulse text-primary" />
                <Loader2 className="absolute -bottom-1 -right-1 size-5 animate-spin rounded-full bg-background p-0.5 text-primary" />
              </div>
              <div>
                <p className="text-base font-bold">AI soch raha hai...</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dukaan ka data analyze ho raha hai, 5-10 second lagenge
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary/60" />
                <span>Stock + sales + trends check ho rahe hain</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // -------- Error state --------
  if (isError || !data) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            <Sparkles className="size-6 text-primary" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            AI ne aapki dukaan analyze ki
          </p>
        </div>
        <Card className="shadow-soft">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
              <AlertTriangle className="size-7" />
            </span>
            <div>
              <p className="font-bold">AI insights load nahi ho paaye</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Network ya server issue ho sakta hai. Dobari try karein.
              </p>
            </div>
            <Button onClick={() => refetch()} size="lg" className="mt-2">
              <RefreshCw className="size-4" /> Dobari Try Karein
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
            <Sparkles className="size-6 text-primary" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            AI ne aapki dukaan analyze ki
          </p>
        </div>
      </div>

      {/* Summary Banner */}
      <Card className="shadow-soft overflow-hidden border-primary/30 py-0">
        <CardContent className="p-0">
          <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 p-5 text-primary-foreground">
            <div className="pointer-events-none absolute -right-6 -top-6 opacity-15">
              <Brain className="size-32" />
            </div>
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      AI Shop Health Summary
                    </p>
                    <p className="text-[11px] opacity-80">
                      Generated at {formatDateTime(data.generatedAt)} ·{" "}
                      {timeAgo(data.generatedAt)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="border-0 bg-white/20 text-primary-foreground backdrop-blur hover:bg-white/30"
                >
                  <RefreshCw
                    className={cn("size-4", isFetching && "animate-spin")}
                  />
                  <span className="hidden sm:inline">
                    {isFetching ? "Soch raha..." : "Refresh"}
                  </span>
                </Button>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed opacity-95">
                {data.summary}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation (pill style) */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "touch-target inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              )}
            >
              <Icon className={cn("size-4", active ? "" : t.color)} />
              {t.label}
              <span
                className={cn(
                  "ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                  active
                    ? "bg-white/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "purchase" && (
        <PurchaseList
          items={data.purchaseList}
          onOpen={openProduct}
          isFetching={isFetching}
        />
      )}
      {tab === "dead" && (
        <DeadStock
          items={data.deadStock}
          onOpen={openProduct}
          isFetching={isFetching}
        />
      )}
      {tab === "predictions" && (
        <Predictions
          items={data.predictions}
          onOpen={openProduct}
          isFetching={isFetching}
        />
      )}
      {tab === "recommendations" && (
        <Recommendations
          items={data.recommendations}
          onOpen={openProduct}
          isFetching={isFetching}
        />
      )}
    </div>
  );
}

// ---------------- Purchase List ----------------
function PurchaseList({
  items,
  onOpen,
  isFetching,
}: {
  items: AIInsights["purchaseList"];
  onOpen: (id: string) => void;
  isFetching: boolean;
}) {
  if (isFetching && items.length === 0) {
    return <ListSkeleton />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Abhi khareedne ki zarurat nahi"
        desc="Saara stock theek hai. AI koi urgent purchase nahi bata raha."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it, i) => (
        <Card
          key={it.productId + "_" + i}
          className="shadow-soft transition-all hover:border-primary/30 hover:shadow-glow py-0"
        >
          <CardContent className="p-4">
            <button
              onClick={() => onOpen(it.productId)}
              className="block w-full text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold leading-tight">
                    {it.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.brand || "No brand"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="border-transparent bg-red-500/10 text-red-500">
                  <Package className="size-3" />
                  Abhi: {it.currentQty}
                </Badge>
                <Badge className="border-transparent bg-emerald-500/10 text-emerald-500">
                  <ShoppingCart className="size-3" />
                  Laana hai: {it.suggestedQty}
                </Badge>
              </div>
              <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Reason: </span>
                {it.reason}
              </p>
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Dead Stock ----------------
function DeadStock({
  items,
  onOpen,
  isFetching,
}: {
  items: AIInsights["deadStock"];
  onOpen: (id: string) => void;
  isFetching: boolean;
}) {
  if (isFetching && items.length === 0) {
    return <ListSkeleton />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Skull}
        title="Koi dead stock nahi hai"
        desc="Sab parts bik rahe hain. Shabaash!"
        tone="emerald"
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it, i) => (
        <Card
          key={it.productId + "_" + i}
          className="shadow-soft transition-all hover:border-primary/30 hover:shadow-glow py-0"
        >
          <CardContent className="p-4">
            <button
              onClick={() => onOpen(it.productId)}
              className="block w-full text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold leading-tight">
                    {it.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.brand || "No brand"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="border-transparent bg-muted text-muted-foreground">
                  <Package className="size-3" />
                  Stock: {it.qty}
                </Badge>
                <Badge className="border-transparent bg-red-500/10 text-red-500">
                  <Clock className="size-3" />
                  {it.daysUnsold} din se nahi bika
                </Badge>
              </div>
              <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  Sujhav:{" "}
                </span>
                {it.suggestion}
              </p>
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Predictions ----------------
function Predictions({
  items,
  onOpen,
  isFetching,
}: {
  items: AIInsights["predictions"];
  onOpen: (id: string) => void;
  isFetching: boolean;
}) {
  if (isFetching && items.length === 0) {
    return <ListSkeleton />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Abhi koi prediction nahi"
        desc="Sales data hone par yahan stock runway dikhega."
        tone="emerald"
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it, i) => {
        const tone =
          it.daysRemaining < 7
            ? "red"
            : it.daysRemaining < 14
              ? "amber"
              : "emerald";
        const toneClasses = {
          red: {
            badge: "bg-red-500/10 text-red-500",
            bar: "bg-red-500",
            label: "Critical — jaldi restock karo!",
          },
          amber: {
            badge: "bg-amber-500/10 text-amber-500",
            bar: "bg-amber-500",
            label: "Warning — order plan karo",
          },
          emerald: {
            badge: "bg-emerald-500/10 text-emerald-500",
            bar: "bg-emerald-500",
            label: "Theek hai — stock healthy",
          },
        }[tone];
        // bar width: visualize against a 30-day cap
        const pct = Math.min(100, Math.max(8, (it.daysRemaining / 30) * 100));

        return (
          <Card
            key={it.productId + "_" + i}
            className="shadow-soft transition-all hover:border-primary/30 hover:shadow-glow py-0"
          >
            <CardContent className="p-4">
              <button
                onClick={() => onOpen(it.productId)}
                className="block w-full text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold leading-tight">
                      {it.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Stock: {it.currentQty} ·{" "}
                      {it.avgDailySale.toFixed(1)}/din bikta hai
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Stock runway
                  </span>
                  <Badge
                    className={cn("border-transparent", toneClasses.badge)}
                  >
                    <Clock className="size-3" />
                    {it.daysRemaining} din baaki
                  </Badge>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      toneClasses.bar
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                  {toneClasses.label}
                </p>
                <p className="mt-1 rounded-lg bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Recommendation:{" "}
                  </span>
                  {it.recommendation}
                </p>
              </button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------- Recommendations ----------------
function Recommendations({
  items,
  onOpen,
  isFetching,
}: {
  items: AIInsights["recommendations"];
  onOpen: (id: string) => void;
  isFetching: boolean;
}) {
  if (isFetching && items.length === 0) {
    return <ListSkeleton />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="Abhi koi sujhav nahi"
        desc="Jaise hi AI koi naya idea milega, yahan dikhega."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it, i) => (
        <Card
          key={i}
          className="shadow-soft transition-all hover:border-primary/30 hover:shadow-glow py-0"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Lightbulb className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">{it.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {it.detail}
                </p>
                {it.relatedProductIds && it.relatedProductIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      Related products:
                    </span>
                    {it.relatedProductIds.slice(0, 2).map((pid, idx) => (
                      <Button
                        key={pid + "_" + idx}
                        size="sm"
                        variant="outline"
                        onClick={() => onOpen(pid)}
                        className="h-7 rounded-full px-2.5 text-[11px]"
                      >
                        <Package className="size-3" />
                        Open Product
                      </Button>
                    ))}
                    {it.relatedProductIds.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{it.relatedProductIds.length - 2} aur
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Shared helpers ----------------
function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  tone = "primary",
}: {
  icon: typeof ShoppingCart;
  title: string;
  desc: string;
  tone?: "primary" | "emerald";
}) {
  const color =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-500"
      : "bg-primary/10 text-primary";
  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-2xl",
            color
          )}
        >
          <Icon className="size-7" />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}


