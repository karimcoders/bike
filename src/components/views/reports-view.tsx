"use client";

import { useMemo, useState } from "react";
import { useAllProducts, useMovements, useAIReport, useSales } from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import { getStockStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  Skull,
  AlertTriangle,
  Clock,
  Package,
  MapPin,
  Sparkles,
  FileText,
  Copy,
  RefreshCw,
  Bot,
  CalendarDays,
  Lightbulb,
  Loader2,
} from "lucide-react";

type ReportType = "daily" | "weekly" | "insights";

export function ReportsView() {
  const { data: prodData, isLoading } = useAllProducts();
  const { data: movData } = useMovements(undefined, 500);
  const { data: salesData } = useSales(7, 200);
  const { openProduct } = useUI();

  const aiReport = useAIReport();
  const [activeType, setActiveType] = useState<ReportType | null>(null);

  const products = prodData?.products || [];
  const movements = movData?.movements || [];
  const sales = salesData?.sales || [];

  const report = useMemo(() => {
    // Top selling = most removed quantity
    const soldMap: Record<string, number> = {};
    movements.forEach((m) => {
      if (m.type === "REMOVED") {
        soldMap[m.productId] = (soldMap[m.productId] || 0) + Math.abs(m.quantity);
      }
    });
    const topSelling = products
      .map((p) => ({
        product: p,
        sold: soldMap[p.id] || 0,
      }))
      .filter((x) => x.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 8);

    // Dead stock = no removal in history + in stock
    const deadStock = products
      .filter((p) => !soldMap[p.id] && p.quantity > 0)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, 8);

    // Low stock
    const lowStock = products
      .filter((p) => getStockStatus(p) !== "high")
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 8);

    // Recently added
    const recent = [...products]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);

    // Category breakdown
    const catMap: Record<string, { count: number; qty: number; value: number }> =
      {};
    products.forEach((p) => {
      const name = p.category?.name || "Uncategorized";
      if (!catMap[name]) catMap[name] = { count: 0, qty: 0, value: 0 };
      catMap[name].count++;
      catMap[name].qty += p.quantity;
      catMap[name].value += p.quantity * p.sellingPrice;
    });
    const breakdown = Object.entries(catMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);

    const maxSold = Math.max(1, ...topSelling.map((t) => t.sold));
    const maxValue = Math.max(1, ...breakdown.map((b) => b.value));

    return {
      topSelling,
      deadStock,
      lowStock,
      recent,
      breakdown,
      maxSold,
      maxValue,
    };
  }, [products, movements]);

  // Last 7 days sales revenue grouped by day
  const salesChart = useMemo(() => {
    const days: { label: string; revenue: number; orders: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
        }),
        revenue: 0,
        orders: 0,
      });
      // attach date key for matching
      (days[days.length - 1] as any)._key = key;
    }
    sales.forEach((s) => {
      const k = (s.createdAt || "").slice(0, 10);
      const bucket = days.find((d) => (d as any)._key === k);
      if (bucket) {
        bucket.revenue += s.total || 0;
        bucket.orders += 1;
      }
    });
    return days;
  }, [sales]);

  const totalRevenue7d = salesChart.reduce((s, d) => s + d.revenue, 0);
  const totalOrders7d = salesChart.reduce((s, d) => s + d.orders, 0);

  // ---- AI Report handlers ----
  const handleGenerate = (type: ReportType) => {
    setActiveType(type);
    aiReport.mutate({ type });
  };

  const handleRegenerate = () => {
    if (activeType) aiReport.mutate({ type: activeType });
  };

  const handleCopy = async () => {
    const text = aiReport.data?.report || "";
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copy ho gayi");
    } catch {
      toast.error("Copy nahi hua, dobara try karein");
    }
  };

  const formatGeneratedAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const REPORT_BUTTONS: {
    type: ReportType;
    label: string;
    hint: string;
    icon: typeof FileText;
    color: string;
  }[] = [
    {
      type: "daily",
      label: "Daily Report",
      hint: "Aaj ki",
      icon: CalendarDays,
      color: "text-emerald-500",
    },
    {
      type: "weekly",
      label: "Weekly Report",
      hint: "Saptahik",
      icon: FileText,
      color: "text-primary",
    },
    {
      type: "insights",
      label: "Business Insights",
      hint: "Insights",
      icon: Lightbulb,
      color: "text-amber-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Reports</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered insights aur inventory data, ek hi jagah
        </p>
      </div>

      {/* ============ AI REPORT GENERATOR ============ */}
      <Card className="shadow-glow border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Bot className="size-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <Sparkles className="size-4 text-primary" />
                  AI Report Generator
                </CardTitle>
                <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                  AI aapke liye report tayyar karega
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {REPORT_BUTTONS.map((b) => {
              const Icon = b.icon;
              const isActive = activeType === b.type;
              const isThisPending = aiReport.isPending && isActive;
              return (
                <Button
                  key={b.type}
                  onClick={() => handleGenerate(b.type)}
                  disabled={aiReport.isPending}
                  variant={isActive ? "default" : "outline"}
                  className={cn(
                    "h-auto justify-start gap-3 rounded-xl px-4 py-3 text-left touch-target",
                    !isActive && "hover:border-primary/40"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0",
                      isActive ? "text-primary-foreground" : b.color
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight">
                      {b.label}
                    </div>
                    <div
                      className={cn(
                        "text-[11px] leading-tight",
                        isActive
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {b.hint}
                    </div>
                  </div>
                  {isThisPending && (
                    <Loader2 className="size-4 animate-spin ml-auto" />
                  )}
                </Button>
              );
            })}
          </div>

          {/* Loading state */}
          {aiReport.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-10 text-center">
              <div className="relative">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Bot className="size-6" />
                </div>
                <Loader2 className="size-4 animate-spin absolute -right-1 -top-1 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  AI report bana raha hai...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  5-15 second lag sakte hain, data analyze ho raha hai
                </p>
              </div>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
            </div>
          )}

          {/* Error state */}
          {aiReport.isError && !aiReport.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-4 py-8 text-center">
              <AlertTriangle className="size-8 text-destructive" />
              <p className="text-sm font-semibold">
                Report generate nahi ho payi
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {aiReport.error?.message || "Kuch gadbad ho gayi, dobara try karein"}
              </p>
              {activeType && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerate}
                  className="mt-1"
                >
                  <RefreshCw className="size-3.5" />
                  Dobara try karein
                </Button>
              )}
            </div>
          )}

          {/* Result */}
          {aiReport.data && !aiReport.isPending && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Result header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <Sparkles className="size-3" />
                    {aiReport.data.type === "daily"
                      ? "Daily Report"
                      : aiReport.data.type === "weekly"
                      ? "Weekly Report"
                      : "Business Insights"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Generated: {formatGeneratedAt(aiReport.data.generatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 px-2 text-xs"
                  >
                    <Copy className="size-3" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerate}
                    disabled={aiReport.isPending}
                    className="h-7 gap-1.5 px-2 text-xs"
                  >
                    <RefreshCw className="size-3" />
                    Regenerate
                  </Button>
                </div>
              </div>
              {/* Markdown body */}
              <div className="max-h-[28rem] overflow-y-auto scroll-thin px-4 py-4">
                <MarkdownContent source={aiReport.data.report} />
              </div>
            </div>
          )}

          {/* Empty hint */}
          {!aiReport.data && !aiReport.isPending && !aiReport.isError && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                <Sparkles className="size-3.5 inline mr-1 text-primary" />
                Upar kisi bhi button par click karein — AI aapke shop ka data
                analyze karke report banayega.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ 7-DAY SALES CHART ============ */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              Last 7 Days Sales
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              ₹{totalRevenue7d.toLocaleString("en-IN")} · {totalOrders7d} orders
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalRevenue7d === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Pichhle 7 din mein koi sale nahi hui
            </p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={salesChart}
                  margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <RTooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value: number) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "Revenue",
                    ]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--primary)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ EXISTING: Category breakdown ============ */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" />
            Stock Value by Category
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.breakdown.map((c) => (
            <div key={c.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {c.count} items · ₹{c.value.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${(c.value / report.maxValue) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top selling */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-emerald-500" />
              Top Selling Parts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {report.topSelling.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales recorded yet
              </p>
            ) : (
              report.topSelling.map(({ product, sold }) => (
                <button
                  key={product.id}
                  onClick={() => openProduct(product.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {product.brand}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-500">
                      {sold} sold
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {product.quantity} left
                    </p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              Needs Restock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {report.lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                All stock levels healthy
              </p>
            ) : (
              report.lowStock.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.supplier || p.brand}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-500">
                      {p.quantity}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      min {p.minStock}
                    </p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Dead stock */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Skull className="size-4 text-muted-foreground" />
              Dead Stock (no sales)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {report.deadStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No dead stock
              </p>
            ) : (
              report.deadStock.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.brand} · ₹{p.sellingPrice}
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
              ))
            )}
          </CardContent>
        </Card>

        {/* Recently added */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              Recently Added
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {report.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No products yet
              </p>
            ) : (
              report.recent.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openProduct(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    <SafeImage
                      src={p.photo}
                      alt={p.name}
                      className="size-full object-cover"
                      placeholder={<Package className="size-4 text-muted-foreground" />}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.brand}
                    </p>
                  </div>
                  {p.location && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary font-mono">
                      <MapPin className="size-3" />
                      {p.location.code}
                    </span>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Markdown renderer with manual styling (typography plugin not installed) ----
function MarkdownContent({ source }: { source: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2 mb-3 text-lg font-bold tracking-tight first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-bold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-2 text-sm font-bold first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-1 space-y-1.5 list-none">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-5 space-y-1.5 list-decimal">{children}</ol>
          ),
          li: ({ children, ...props }) => {
            // render top-level li (inside ul) with bullet emoji
            return (
              <li
                className="pl-1 leading-relaxed marker:text-primary"
                {...props}
              >
                <span className="mr-1.5 text-primary">•</span>
                <span>{children}</span>
              </li>
            );
          },
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-muted-foreground">{children}</em>
          ),
          hr: () => (
            <hr className="my-4 border-border" />
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/50 bg-muted/40 pl-3 py-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary">
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 overflow-x-auto rounded-xl bg-muted p-3 text-xs">
                <code className="font-mono">{children}</code>
              </pre>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/50 px-2 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1.5">{children}</td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
