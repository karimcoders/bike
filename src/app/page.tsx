"use client";

import { useEffect } from "react";
import { useMe } from "@/lib/queries";
import { useUI } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { LoginView } from "@/components/views/login-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { ProductsView } from "@/components/views/products-view";
import { ProductDetailView } from "@/components/views/product-detail-view";
import { ProductFormView } from "@/components/views/product-form-view";
import { CategoriesView } from "@/components/views/categories-view";
import { LocationsView } from "@/components/views/locations-view";
import { StockView } from "@/components/views/stock-view";
import { ReportsView } from "@/components/views/reports-view";
import { SettingsView } from "@/components/views/settings-view";
import { SalesView } from "@/components/views/sales-view";
import { AIAssistantView } from "@/components/views/ai-assistant-view";
import { AIInsightsView } from "@/components/views/ai-insights-view";
import { CustomersView } from "@/components/views/customers-view";
import { CustomerDetailView } from "@/components/views/customer-detail-view";
import { CloseShopView } from "@/components/views/close-shop-view";
import { Skeleton } from "@/components/ui/skeleton";

function ViewRouter() {
  const view = useUI((s) => s.view);
  switch (view) {
    case "dashboard":
      return <DashboardView />;
    case "products":
      return <ProductsView />;
    case "product-detail":
      return <ProductDetailView />;
    case "product-form":
      return <ProductFormView />;
    case "categories":
      return <CategoriesView />;
    case "locations":
      return <LocationsView />;
    case "stock-in":
      return <StockView direction="in" />;
    case "stock-out":
      return <StockView direction="out" />;
    case "sales":
      return <SalesView />;
    case "customers":
      return <CustomersView />;
    case "customer-detail":
      return <CustomerDetailView />;
    case "close-shop":
      return <CloseShopView />;
    case "reports":
      return <ReportsView />;
    case "settings":
      return <SettingsView />;
    case "ai-assistant":
      return <AIAssistantView />;
    case "ai-insights":
      return <AIInsightsView />;
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
