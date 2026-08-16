"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUI } from "@/lib/store";
import { useLogout, useSettings, jfetch } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeImage } from "@/components/ui/safe-image";
import { StockBadge } from "@/components/stock-badge";
import {
  Home,
  Package,
  Tags,
  Grid3x3,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Search,
  Sun,
  Moon,
  X,
  Bike,
  Sparkles,
  Bot,
  ShoppingCart,
  Users,
  Power,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { getPrimaryPhoto, getStockStatus, type View, type Product } from "@/lib/types";

// =====================================================================
// NAVIGATION — grouped & simplified
// ---------------------------------------------------------------------
// Previously 13 flat items (too many for a rural shop owner to scan).
// Now 7 primary entries with expandable groups (Inventory, Reports).
// The "ShopMitra AI" entry was removed from the sidebar — it now lives
// as a floating button (bottom-right) so it's always one tap away.
// =====================================================================

type NavLeaf = {
  view: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const NAV_GROUPS: NavEntry[] = [
  { view: "dashboard", label: "Home", icon: Home },
  {
    label: "Inventory",
    icon: Package,
    children: [
      { view: "products", label: "All Products", icon: Package },
      { view: "stock-in", label: "Stock In", icon: ArrowDownToLine },
      { view: "stock-out", label: "Stock Out", icon: ArrowUpFromLine },
      { view: "categories", label: "Categories", icon: Tags },
      { view: "locations", label: "Locations", icon: Grid3x3 },
    ],
  },
  { view: "sales", label: "Sell", icon: ShoppingCart },
  { view: "customers", label: "Customers", icon: Users },
  {
    label: "Reports",
    icon: BarChart3,
    children: [
      { view: "reports", label: "Sales Report", icon: BarChart3 },
      { view: "ai-insights", label: "AI Insights", icon: Sparkles },
      { view: "close-shop", label: "Close Shop", icon: Power },
    ],
  },
  { view: "settings", label: "Settings", icon: SettingsIcon },
];

// =====================================================================
// LIVE SEARCH AUTOCOMPLETE
// ---------------------------------------------------------------------
// As the user types in the header search, we filter the full product
// list CLIENT-SIDE (no network call per keystroke). The products are
// already cached by TanStack Query (loaded by the Products view or any
// other view that calls useAllProducts). This gives an instant
// autocomplete dropdown — the moment you type "L" you see every product
// whose name / brand / OEM / bike-model starts with or contains "L".
//
// The dropdown shows up to 8 matches with photo, name, brand, price and
// a stock badge. Clicking a match opens the product detail. Pressing
// Enter or clicking "See all results" navigates to the full Products
// view (which has filters, AI search, etc).
// =====================================================================

function SearchAutocomplete({
  search,
  onSearchChange,
  onPick,
  onSeeAll,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onPick: (id: string) => void;
  onSeeAll: () => void;
}) {
  // ---- LAZY product fetch ----
  // We do NOT fetch all products on every page (that was making the dashboard
  // needlessly trigger a full /api/products round-trip). Instead we defer the
  // fetch until the user actually interacts with the search box — first focus
  // or first keystroke. Once fetched, TanStack Query caches it for 2 minutes
  // (staleTime) so subsequent focuses are instant.
  const [hasInteracted, setHasInteracted] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => jfetch<{ products: Product[] }>(`/api/products`),
    enabled: hasInteracted,
    staleTime: 2 * 60 * 1000,
  });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const products = data?.products || [];
  const q = search.trim().toLowerCase();

  // ---- Click-outside handler ----
  // Close the dropdown when the user clicks anywhere outside the search
  // container. This is the standard combobox pattern.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ---- Instant client-side filtering ----
  // We sort results so that name-starts-with matches come first, then
  // name-contains, then everything else (brand, OEM, bike model, etc).
  // This gives the most relevant results at the top.
  const matches = useMemo(() => {
    if (!q) return [];
    return products
      .filter((p) => {
        const hay = [
          p.name,
          p.oemNumber,
          p.brand,
          p.bikeModels,
          p.supplier,
          p.barcode || "",
          p.location?.code || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStarts = aName.startsWith(q) ? 0 : aName.includes(q) ? 1 : 2;
        const bStarts = bName.startsWith(q) ? 0 : bName.includes(q) ? 1 : 2;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 8);
  }, [products, q]);

  const totalMatchCount = useMemo(() => {
    if (!q) return 0;
    return products.filter((p) => {
      const hay = [
        p.name,
        p.oemNumber,
        p.brand,
        p.bikeModels,
        p.supplier,
        p.barcode || "",
        p.location?.code || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    }).length;
  }, [products, q]);

  const showDropdown = open && q.length > 0;

  return (
    <div className="relative flex-1 max-w-xl" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 z-10 text-muted-foreground pointer-events-none" />
      <Input
        value={search}
        onChange={(e) => {
          onSearchChange(e.target.value);
          if (!hasInteracted) setHasInteracted(true);
          setOpen(true);
        }}
        onFocus={() => {
          if (!hasInteracted) setHasInteracted(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onSeeAll();
          }
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search parts, OEM, bike, brand…  (type to see live results)"
        className="h-11 pl-10 pr-9 rounded-xl text-base shadow-soft"
        autoComplete="off"
      />
      {/* Clear button */}
      {search && (
        <button
          type="button"
          onClick={() => {
            onSearchChange("");
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}

      {/* ---- Live autocomplete dropdown ---- */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[70vh] overflow-hidden rounded-xl border border-border bg-popover shadow-glow animate-in fade-in-0 slide-in-from-top-1 duration-100">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Products load ho rahe
              hain…
            </div>
          )}

          {/* No results */}
          {!isLoading && matches.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm font-medium">Koi product nahi mila</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                &ldquo;{search}&rdquo; se koi match nahi. AI search try karein?
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-8 rounded-lg"
                onClick={() => {
                  setOpen(false);
                  onSeeAll();
                }}
              >
                <Sparkles className="size-3.5" /> AI Search
              </Button>
            </div>
          )}

          {/* Results list */}
          {!isLoading && matches.length > 0 && (
            <>
              <div className="max-h-[55vh] overflow-y-auto scroll-thin">
                {matches.map((p) => (
                  <SearchResultRow
                    key={p.id}
                    product={p}
                    query={q}
                    onClick={() => {
                      onPick(p.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
              {/* See all results footer */}
              {totalMatchCount > matches.length && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onSeeAll();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-muted/50 py-2.5 text-sm font-medium text-primary hover:bg-muted"
                >
                  <Package className="size-4" />
                  Aur {totalMatchCount - matches.length} results dekhein
                  <span className="text-muted-foreground">→</span>
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  onSeeAll();
                }}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                <Search className="size-3.5" /> Products page kholo (filters +
                AI search)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Single search result row ----
function SearchResultRow({
  product,
  query,
  onClick,
}: {
  product: Product;
  query: string;
  onClick: () => void;
}) {
  const status = getStockStatus(product);
  const photo = getPrimaryPhoto(product.photo);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent border-b border-border/50 last:border-0"
    >
      {/* Thumbnail */}
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <SafeImage
          src={photo}
          alt={product.name}
          className="size-full object-cover"
          size="thumb"
          placeholder={<Package className="size-5 text-muted-foreground/40" />}
        />
      </div>
      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <HighlightMatch text={product.name} query={query} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {product.brand && <span>{product.brand}</span>}
          {product.oemNumber && (
            <span>
              {product.brand ? " · " : ""}
              OEM {product.oemNumber}
            </span>
          )}
          {product.location?.code && (
            <span> · [{product.location.code}]</span>
          )}
        </p>
      </div>
      {/* Price + stock */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-bold">
          ₹{product.sellingPrice.toLocaleString("en-IN")}
        </span>
        <StockBadge quantity={product.quantity} minStock={product.minStock} />
      </div>
    </button>
  );
}

// ---- Highlight the matched substring in the product name ----
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-primary/20 text-primary rounded px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    view,
    go,
    sidebarOpen,
    setSidebarOpen,
    search,
    setSearch,
    openProduct,
    user,
  } = useUI();
  const logout = useLogout();
  const { data: settingsData } = useSettings();
  const { theme, setTheme } = useTheme();

  // ---- Neon DB keep-warm ----
  // Neon (free tier) auto-suspends the database after 5 min of inactivity.
  // The first query after suspension takes 2-5s, making the app feel slow.
  // While the shop app is open, we ping /api/keep-warm every 3 minutes to
  // reset Neon's idle timer. The endpoint runs `SELECT 1` (cheapest possible
  // query) and uses cookie-only auth (no DB call for the auth check itself).
  // This is invisible to the user — no UI feedback, no network waterfall on
  // the critical path. It only fires when the tab is visible (not hidden).
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = () => {
      if (document.visibilityState === "visible") {
        fetch("/api/keep-warm", { cache: "no-store" }).catch(() => {});
      }
    };
    // Start the interval 3 min after the app opens (don't fire immediately —
    // the initial API calls already wake the DB).
    timer = setInterval(ping, 3 * 60 * 1000);
    // Also ping when the tab regains focus (user switched away and came back).
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // ---- Expandable nav groups ----
  // The active view's containing group is auto-expanded (derived from
  // `view`, no effect needed). The user can manually toggle any group;
  // their override is stored in `groupOverrides` and takes precedence
  // over the default. This avoids calling setState inside an effect
  // (which would trigger cascading renders per the React hooks lint rule).
  const [groupOverrides, setGroupOverrides] = useState<
    Record<string, "open" | "closed">
  >({});

  const activeGroupLabel = useMemo(() => {
    for (const entry of NAV_GROUPS) {
      if ("children" in entry && entry.children.some((c) => c.view === view)) {
        return entry.label;
      }
    }
    return null;
  }, [view]);

  const isGroupExpanded = (label: string) => {
    const override = groupOverrides[label];
    if (override !== undefined) return override === "open";
    return label === activeGroupLabel; // default: active group open, others closed
  };

  const toggleGroup = (label: string) => {
    const currentlyOpen = isGroupExpanded(label);
    setGroupOverrides((prev) => ({
      ...prev,
      [label]: currentlyOpen ? "closed" : "open",
    }));
  };

  const shopName = settingsData?.settings.shopName || "Bike Inventory Pro";
  const shopLogo = settingsData?.settings.logo || null;

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo + Shop name — uses the shop logo uploaded in Settings */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-glow shrink-0">
          {shopLogo ? (
            <SafeImage
              src={shopLogo}
              alt={shopName}
              className="size-full object-cover"
              size="thumb"
              placeholder={<Bike className="size-5" />}
            />
          ) : (
            <Bike className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">
            {shopName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            AI Bike Shop OS
          </p>
        </div>
        <button
          className="ml-auto md:hidden text-muted-foreground"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Nav — grouped with expand/collapse */}
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-1">
        {NAV_GROUPS.map((entry) => {
          // ---- Group with children ----
          if ("children" in entry) {
            const isExpanded = isGroupExpanded(entry.label);
            const hasActiveChild = entry.children.some(
              (c) => c.view === view,
            );
            const GroupIcon = entry.icon;
            return (
              <div key={entry.label} className="space-y-1">
                <button
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={isExpanded}
                  className={cn(
                    "no-select flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all touch-target",
                    hasActiveChild
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <GroupIcon className="size-5 shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isExpanded && "rotate-180",
                    )}
                  />
                </button>
                {isExpanded && (
                  <div className="ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
                    {entry.children.map((child) => {
                      const active = view === child.view;
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.view}
                          onClick={() => go(child.view)}
                          className={cn(
                            "no-select flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all touch-target",
                            active
                              ? "bg-primary text-primary-foreground shadow-soft"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <ChildIcon className="size-4 shrink-0" />
                          <span className="flex-1 text-left">
                            {child.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // ---- Primary leaf item (no children) ----
          const active = view === entry.view;
          const Icon = entry.icon;
          return (
            <button
              key={entry.label}
              onClick={() => go(entry.view)}
              className={cn(
                "no-select flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all touch-target",
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1 text-left">{entry.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 px-3 py-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-[11px] text-muted-foreground capitalize">
              {user?.role}
            </p>
          </div>
          <button
            onClick={() => logout.mutate()}
            className="text-muted-foreground hover:text-destructive transition-colors p-1.5"
            aria-label="Logout"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 glass-sidebar border-r border-sidebar-border sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 h-full w-72 glass-sidebar border-r border-sidebar-border md:hidden animate-in slide-in-from-left duration-200">
            {SidebarContent}
          </aside>
        </>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 glass border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <button
              className="md:hidden text-foreground p-1"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-6" />
            </button>

            {/* Live autocomplete search */}
            <SearchAutocomplete
              search={search}
              onSearchChange={setSearch}
              onPick={(id) => openProduct(id)}
              onSeeAll={() => go("products")}
            />

            {/* AI Assistant quick button */}
            <Button
              variant={view === "ai-assistant" ? "default" : "outline"}
              size="icon"
              className="size-11 rounded-xl shrink-0 relative"
              onClick={() => go("ai-assistant")}
              aria-label="AI Assistant"
            >
              <Bot className="size-5" />
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-primary" />
              </span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-xl shrink-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Sun className="hidden size-5 dark:block" />
              <Moon className="size-5 dark:hidden" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border px-4 md:px-6 py-4 text-center text-xs text-muted-foreground">
          <p>
            AI Bike Parts Shop OS · ShopMitra AI sath mein ·{" "}
            <span className="text-primary font-medium">AI-Powered v2.0</span>
          </p>
        </footer>
      </div>

      {/* Floating ShopMitra AI chatbot button — always one tap away.
          Hidden when the user is already on the ai-assistant view. */}
      {view !== "ai-assistant" && (
        <button
          onClick={() => go("ai-assistant")}
          aria-label="AI Assistant"
          className="fixed bottom-4 right-4 z-50 size-14 rounded-full bg-primary text-primary-foreground shadow-glow flex items-center justify-center hover:scale-105 transition-transform"
        >
          <Bot className="size-6" />
        </button>
      )}
    </div>
  );
}
