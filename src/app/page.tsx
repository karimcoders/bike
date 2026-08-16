"use client";

import { lazy, Suspense, useEffect } from "react";
import { useMe } from "@/lib/queries";
import { useUI } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { LoginView } from "@/components/views/login-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================================
// LAZY-LOADED VIEWS — BUNDLE SPLITTING
// ---------------------------------------------------------------------
// Previously every view (sales 2030 lines, settings 1799, customer-detail
// 1651, close-shop 1052, locations 1228, reports 794 with recharts +
// react-markdown, ai-assistant, ai-insights, product-form 801, etc.) was
// statically imported here, forcing the browser to download + parse the
// ENTIRE app before hydration could start. That was the #1 reason the app
// felt slow.
//
// Now only Dashboard (the default landing view) + Login are eagerly loaded.
// Every other view is split into its own chunk via next/dynamic and only
// downloaded the first time the user navigates to it. This cuts the initial
// JS payload dramatically and lets the dashboard hydrate near-instantly.
//
// Each lazy view gets a lightweight Suspense fallback (skeleton) so the user
// never sees a blank screen while the chunk downloads — they see the app
// shell + a skeleton in the content area, which feels instant.
// =====================================================================

const ProductsView = lazy(() =>
  import("@/components/views/products-view").then((m) => ({
    default: m.ProductsView,
  }))
);
const ProductDetailView = lazy(() =>
  import("@/components/views/product-detail-view").then((m) => ({
    default: m.ProductDetailView,
  }))
);
const ProductFormView = lazy(() =>
  import("@/components/views/product-form-view").then((m) => ({
    default: m.ProductFormView,
  }))
);
const CategoriesView = lazy(() =>
  import("@/components/views/categories-view").then((m) => ({
    default: m.CategoriesView,
  }))
);
const LocationsView = lazy(() =>
  import("@/components/views/locations-view").then((m) => ({
    default: m.LocationsView,
  }))
);
const StockView = lazy(() =>
  import("@/components/views/stock-view").then((m) => ({
    default: m.StockView,
  }))
);
const SalesView = lazy(() =>
  import("@/components/views/sales-view").then((m) => ({ default: m.SalesView }))
);
const CustomersView = lazy(() =>
  import("@/components/views/customers-view").then((m) => ({
    default: m.CustomersView,
  }))
);
const CustomerDetailView = lazy(() =>
  import("@/components/views/customer-detail-view").then((m) => ({
    default: m.CustomerDetailView,
  }))
);
const CloseShopView = lazy(() =>
  import("@/components/views/close-shop-view").then((m) => ({
    default: m.CloseShopView,
  }))
);
const ReportsView = lazy(() =>
  import("@/components/views/reports-view").then((m) => ({
    default: m.ReportsView,
  }))
);
const SettingsView = lazy(() =>
  import("@/components/views/settings-view").then((m) => ({
    default: m.SettingsView,
  }))
);
const AIAssistantView = lazy(() =>
  import("@/components/views/ai-assistant-view").then((m) => ({
    default: m.AIAssistantView,
  }))
);
const AIInsightsView = lazy(() =>
  import("@/components/views/ai-insights-view").then((m) => ({
    default: m.AIInsightsView,
  }))
);

// Lightweight skeleton shown while a lazy view chunk downloads. Matches the
// dashboard's skeleton rhythm so transitions feel seamless.
function ViewSkeleton() {
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

function ViewRouter() {
  const view = useUI((s) => s.view);
  switch (view) {
    case "dashboard":
      return <DashboardView />;
    case "products":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <ProductsView />
        </Suspense>
      );
    case "product-detail":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <ProductDetailView />
        </Suspense>
      );
    case "product-form":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <ProductFormView />
        </Suspense>
      );
    case "categories":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <CategoriesView />
        </Suspense>
      );
    case "locations":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <LocationsView />
        </Suspense>
      );
    case "stock-in":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <StockView direction="in" />
        </Suspense>
      );
    case "stock-out":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <StockView direction="out" />
        </Suspense>
      );
    case "sales":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <SalesView />
        </Suspense>
      );
    case "customers":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <CustomersView />
        </Suspense>
      );
    case "customer-detail":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <CustomerDetailView />
        </Suspense>
      );
    case "close-shop":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <CloseShopView />
        </Suspense>
      );
    case "reports":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <ReportsView />
        </Suspense>
      );
    case "settings":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <SettingsView />
        </Suspense>
      );
    case "ai-assistant":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <AIAssistantView />
        </Suspense>
      );
    case "ai-insights":
      return (
        <Suspense fallback={<ViewSkeleton />}>
          <AIInsightsView />
        </Suspense>
      );
    default:
      return <DashboardView />;
  }
}

export default function Home() {
  const { data, isLoading } = useMe();
  const setUser = useUI((s) => s.setUser);

  useEffect(() => {
    setUser(data?.user || null);
  }, [data, setUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto size-16 rounded-2xl" />
          <Skeleton className="mx-auto h-4 w-48 rounded" />
          <Skeleton className="mx-auto h-3 w-32 rounded" />
        </div>
      </div>
    );
  }

  if (!data?.user) {
    return <LoginView />;
  }

  return (
    <AppShell>
      <ViewRouter />
    </AppShell>
  );
}
