"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAllProducts,
  useCategories,
  useAISearch,
  useVoiceSearch,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import {
  getBikeModels,
  getStockStatus,
  getPrimaryPhoto,
  displayLocation,
  type Product,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Package,
  MapPin,
  SlidersHorizontal,
  X,
  Filter,
  Sparkles,
  Mic,
  Square,
  Loader2,
  ArrowLeft,
} from "lucide-react";

export function ProductsView() {
  const { data, isLoading } = useAllProducts();
  const { data: catData } = useCategories();
  const {
    search,
    setSearch,
    filters,
    setFilters,
    resetFilters,
    openProduct,
    openAddProduct,
    navigateToLocation,
  } = useUI();

  // AI hooks
  const aiSearch = useAISearch();
  const voiceSearch = useVoiceSearch();

  const [showFilters, setShowFilters] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const products = data?.products || [];
  const categories = catData?.categories || [];

  // Derived AI state (works for both text AI search and voice search)
  const aiTextData = aiSearch.data;
  const aiVoiceData = voiceSearch.data;
  const showAIResults = !!(aiTextData || aiVoiceData);
  const aiPending = aiSearch.isPending || voiceSearch.isPending;
  const aiResults: Product[] | undefined =
    aiTextData?.results || aiVoiceData?.results;
  const aiInterpretation: string | undefined =
    aiTextData?.interpretation || aiVoiceData?.interpretation;
  const voiceTranscript: string | undefined = aiVoiceData?.transcript;

  const clearAIResults = () => {
    aiSearch.reset();
    voiceSearch.reset();
    setAiQuery("");
  };

  const submitAISearch = () => {
    const q = aiQuery.trim();
    if (!q || aiPending || recording) return;
    // Clear any prior voice results so we show fresh text-search results
    voiceSearch.reset();
    aiSearch.mutate({ query: q });
  };

  // ---- Debounced LIVE AI auto-search (autocomplete-style) ----
  // As the user types in the AI search box, we wait 1200ms after they stop
  // typing, then automatically fire the AI search. This gives an
  // "autocomplete" feel — no need to press Enter or click Search. The
  // 1200ms delay avoids spamming the LLM on every keystroke (each call is
  // 2-5s and costs money). Enter / Search button still work for immediate
  // submission.
  const aiQueryTrimmed = aiQuery.trim();
  useEffect(() => {
    // Skip if empty, already pending, or recording voice
    if (!aiQueryTrimmed || aiPending || recording) return;
    const timer = setTimeout(() => {
      // Only auto-fire if the query is still the same (user hasn't typed more)
      voiceSearch.reset();
      aiSearch.mutate({ query: aiQueryTrimmed });
    }, 1200);
    return () => clearTimeout(timer);
  }, [aiQueryTrimmed, aiPending, recording, aiSearch, voiceSearch]);

  // ---- Voice recording (MediaRecorder API) ----
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Mic support nahi hai is browser me");
        return;
      }
      // Clear any previous AI results when starting a new voice search
      aiSearch.reset();
      voiceSearch.reset();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          if (base64) {
            voiceSearch.mutate({ audio: base64 });
          } else {
            toast.error("Audio record nahi hua, dobara try karo");
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      toast.error(
        err?.name === "NotAllowedError"
          ? "Mic permission deny ho gaya. Browser settings me allow karo."
          : "Mic start nahi hua. Dobara try karo."
      );
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  // Collect unique bike models + brands for filter dropdowns
  const allBikes = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => getBikeModels(p).forEach((b) => set.add(b)));
    return Array.from(set).sort();
  }, [products]);
  const allBrands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.brand && set.add(p.brand));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (q) {
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
          if (!hay.includes(q)) return false;
        }
        if (filters.category && p.categoryId !== filters.category) return false;
        if (
          filters.bike &&
          !p.bikeModels.toLowerCase().includes(filters.bike.toLowerCase())
        )
          return false;
        if (filters.brand && p.brand !== filters.brand) return false;
        const status = getStockStatus(p);
        if (filters.status === "low" && status !== "low") return false;
        if (filters.status === "out" && status !== "out") return false;
        if (filters.status === "high" && status !== "high") return false;
        return true;
      })
      .sort((a, b) => {
        // sort by relevance: name starts-with q first, then updatedAt
        if (q) {
          const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [products, search, filters]);

  const activeFilters =
    (filters.category ? 1 : 0) +
    (filters.bike ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.status ? 1 : 0);

  // Determine which loading label to show in the AI banner
  const aiLoadingLabel = recording
    ? "Listening... Bolo kya chahiye"
    : voiceSearch.isPending
      ? "Transcribing... Awaaz likh rahe hain"
      : "AI soch raha hai...";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            Products
          </h1>
          <p className="text-sm text-muted-foreground">
            {showAIResults
              ? `${aiResults?.length || 0} AI results`
              : `${filtered.length} of ${products.length} parts`}
          </p>
        </div>
        <Button
          onClick={openAddProduct}
          className="h-11 rounded-xl shadow-glow"
          size="lg"
        >
          <Plus className="size-5" /> Add Product
        </Button>
      </div>

      {/* ---------- AI Search Section (visually distinct, on top) ---------- */}
      <Card className="overflow-hidden border-primary/40 shadow-glow">
        <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">AI Search</p>
              <p className="truncate text-xs text-muted-foreground">
                Hindi me likho — AI samajh lega
              </p>
            </div>
          </div>

          {/* Input row: text input + AI button + Voice button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitAISearch();
                  }
                }}
                placeholder="Splendor ka brake shoe, clutch wire chahiye..."
                className="h-12 rounded-xl pl-11 pr-10 text-base shadow-soft"
                disabled={aiPending || recording}
              />
              {aiQuery && !aiPending && !recording && (
                <button
                  onClick={() => setAiQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear AI input"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <Button
              onClick={submitAISearch}
              disabled={aiPending || recording || !aiQuery.trim()}
              size="lg"
              className="h-12 shrink-0 rounded-xl px-4 shadow-glow sm:px-5"
              aria-label="AI Search"
            >
              {aiSearch.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Sparkles className="size-5" />
              )}
              <span className="ml-1.5 hidden sm:inline">Search</span>
            </Button>

            {/* Voice button — large circular mic, red when recording */}
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={aiPending && !recording}
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-full transition-all touch-target",
                recording
                  ? "bg-red-500 text-white shadow-glow ring-4 ring-red-500/30 animate-pulse"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow disabled:opacity-50"
              )}
              aria-label={recording ? "Stop recording (Bolo band karo)" : "Bolo - voice search"}
              title={recording ? "Stop recording" : "Bolo (Voice Search)"}
            >
              {recording ? (
                <Square className="size-5 fill-current" />
              ) : (
                <Mic className="size-5" />
              )}
            </button>
          </div>

          {/* Hint row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-primary/80">Examples:</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5">Splendor ka brake shoe</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5">clutch wire chahiye</span>
            <span className="rounded-full bg-background/60 px-2 py-0.5">sabse sasta spark plug</span>
            <span className="ml-auto hidden items-center gap-1 font-medium text-primary/80 sm:flex">
              <Sparkles className="size-3.5" /> Likhte hi AI auto-search karega (1s wait)
            </span>
          </div>
        </div>
      </Card>

      {/* ---------- AI Loading Banner ---------- */}
      {aiPending && (
        <Card className="border-primary/40 bg-primary/5 shadow-soft">
          <CardContent className="flex items-center gap-3 p-4">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{aiLoadingLabel}</p>
              <p className="text-xs text-muted-foreground">
                Hinglish query samajh kar products dhundh rahe hain
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- AI Results Panel (replaces normal list) ---------- */}
      {showAIResults && !aiPending && (
        <div className="space-y-3">
          {/* Interpretation banner */}
          <Card className="border-primary/40 bg-primary/5 shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                      AI Interpretation
                    </p>
                    {voiceTranscript && (
                      <p className="mt-1 text-sm font-medium">
                        <span className="text-muted-foreground">Aapne kaha: </span>
                        <span className="text-foreground">&ldquo;{voiceTranscript}&rdquo;</span>
                      </p>
                    )}
                    {aiInterpretation && (
                      <p className="mt-1 text-sm text-foreground/90">
                        {aiInterpretation}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAIResults}
                  className="h-8 shrink-0"
                >
                  <ArrowLeft className="size-4" /> Back
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-primary/20 pt-2">
                <p className="text-sm font-semibold">
                  {aiResults?.length || 0} parts mile
                </p>
                <button
                  onClick={clearAIResults}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Clear AI results
                </button>
              </div>
            </CardContent>
          </Card>

          {/* AI matched products */}
          {aiResults && aiResults.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aiResults.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={() => openProduct(p.id)}
                  onNavigate={() =>
                    p.locationId && navigateToLocation(p.locationId)
                  }
                />
              ))}
            </div>
          ) : (
            <Card className="shadow-soft">
              <CardContent className="py-12 text-center">
                <Package className="mx-auto mb-3 size-12 text-muted-foreground/50" />
                <p className="font-medium">AI ko kuch nahi mila</p>
                <p className="text-sm text-muted-foreground">
                  Doosre shabdon me try karo ya &ldquo;Back&rdquo; daba kar normal
                  search use karo
                </p>
                <Button
                  onClick={clearAIResults}
                  className="mt-4"
                  size="lg"
                  variant="outline"
                >
                  <ArrowLeft className="size-5" /> Back to all products
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------- Normal browsing mode (hidden when AI results active) ---------- */}
      {!showAIResults && !aiPending && (
        <>
          {/* Search + filter toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quick search — name, OEM, bike, brand, location..."
                className="h-12 rounded-xl pl-11 pr-10 text-base shadow-soft"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
            <Button
              variant={showFilters || activeFilters > 0 ? "default" : "outline"}
              size="lg"
              className="h-12 rounded-xl px-4 relative"
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal className="size-5" />
              {activeFilters > 0 && (
                <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-background text-xs font-bold text-primary">
                  {activeFilters}
                </span>
              )}
            </Button>
          </div>

          {/* Status quick chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { v: "", label: "All" },
              { v: "low", label: "Low Stock" },
              { v: "out", label: "Out of Stock" },
              { v: "high", label: "In Stock" },
            ].map((s) => (
              <button
                key={s.v}
                onClick={() => setFilters({ status: s.v as any })}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  filters.status === s.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <Card className="shadow-soft">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Filter className="size-4" /> Filters
                  </p>
                  {activeFilters > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetFilters}
                      className="h-7 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Category
                    </label>
                    <select
                      value={filters.category}
                      onChange={(e) => setFilters({ category: e.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Bike Model
                    </label>
                    <select
                      value={filters.bike}
                      onChange={(e) => setFilters({ bike: e.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All bikes</option>
                      {allBikes.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Brand
                    </label>
                    <select
                      value={filters.brand}
                      onChange={(e) => setFilters({ brand: e.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">All brands</option>
                      {allBrands.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Product list */}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="shadow-soft">
              <CardContent className="py-12 text-center">
                <Package className="mx-auto mb-3 size-12 text-muted-foreground/50" />
                <p className="font-medium">No products found</p>
                <p className="text-sm text-muted-foreground">
                  {search || activeFilters
                    ? "Try a different search or filter"
                    : "Add your first product to get started"}
                </p>
                {!search && !activeFilters && (
                  <Button
                    onClick={openAddProduct}
                    className="mt-4"
                    size="lg"
                  >
                    <Plus className="size-5" /> Add Product
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={() => openProduct(p.id)}
                  onNavigate={() =>
                    p.locationId && navigateToLocation(p.locationId)
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onOpen,
  onNavigate,
}: {
  product: Product;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const bikes = getBikeModels(product);
  const status = getStockStatus(product);
  return (
    <Card className="shadow-soft overflow-hidden py-0 transition-all hover:shadow-glow hover:border-primary/30">
      <div className="flex">
        {/* Photo */}
        <button
          onClick={onOpen}
          className="flex size-24 shrink-0 items-center justify-center bg-muted"
          aria-label="View product"
        >
          <SafeImage
            src={getPrimaryPhoto(product.photo)}
            alt={product.name}
            className="size-full object-cover"
            size="thumb"
            placeholder={<Package className="size-8 text-muted-foreground/40" />}
          />
        </button>
        {/* Info */}
        <CardContent className="min-w-0 flex-1 p-3">
          <button onClick={onOpen} className="block w-full text-left">
            <p className="truncate text-sm font-bold leading-tight">
              {product.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {product.brand}
              {product.oemNumber && ` · ${product.oemNumber}`}
            </p>
            {bikes.length > 0 && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                {bikes.slice(0, 3).join(", ")}
                {bikes.length > 3 && ` +${bikes.length - 3}`}
              </p>
            )}
          </button>
          <div className="mt-2 flex items-center justify-between gap-2">
            <StockBadge
              quantity={product.quantity}
              minStock={product.minStock}
              className="text-[10px]"
            />
            {product.location ? (
              <button
                onClick={onNavigate}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                  status === "out"
                    ? "stock-out"
                    : status === "low"
                      ? "stock-low"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <MapPin className="size-3" />
                {displayLocation(product.location.code)}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                No location
              </span>
            )}
          </div>
          {/* Price row — keeps "Find Part" results useful at a glance */}
          {product.sellingPrice > 0 && (
            <p className="mt-1.5 text-sm font-bold text-foreground">
              ₹{product.sellingPrice.toLocaleString("en-IN")}
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
