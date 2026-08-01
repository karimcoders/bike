import { create } from "zustand";
import type { View, SessionUser } from "./types";

type Filters = {
  category: string; // categoryId or ""
  bike: string;
  brand: string;
  status: "" | "low" | "out" | "high";
};

type UIState = {
  user: SessionUser | null;
  view: View;
  selectedProductId: string | null;
  editingProductId: string | null; // null = add mode
  selectedCustomerId: string | null;
  selectedSaleId: string | null;
  highlightLocationId: string | null;
  search: string;
  filters: Filters;
  sidebarOpen: boolean; // mobile drawer

  setUser: (u: SessionUser | null) => void;
  setView: (v: View) => void;
  go: (v: View) => void;
  openProduct: (id: string) => void;
  openAddProduct: () => void;
  openEditProduct: (id: string) => void;
  openCustomer: (id: string) => void;
  openSaleBill: (id: string) => void;
  navigateToLocation: (locationId: string) => void;
  clearHighlight: () => void;
  setSearch: (s: string) => void;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  setSidebarOpen: (open: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  user: null,
  view: "dashboard",
  selectedProductId: null,
  editingProductId: null,
  selectedCustomerId: null,
  selectedSaleId: null,
  highlightLocationId: null,
  search: "",
  filters: { category: "", bike: "", brand: "", status: "" },
  sidebarOpen: false,

  setUser: (u) => set({ user: u }),
  setView: (v) => set({ view: v }),
  go: (v) => set({ view: v, sidebarOpen: false }),
  openProduct: (id) => set({ view: "product-detail", selectedProductId: id }),
  openAddProduct: () =>
    set({ view: "product-form", editingProductId: null }),
  openEditProduct: (id) =>
    set({ view: "product-form", editingProductId: id }),
  openCustomer: (id) => set({ view: "customer-detail", selectedCustomerId: id }),
  openSaleBill: (id) => set({ view: "sales", selectedSaleId: id }),
  navigateToLocation: (locationId) =>
    set({ view: "locations", highlightLocationId: locationId, sidebarOpen: false }),
  clearHighlight: () => set({ highlightLocationId: null }),
  setSearch: (s) => set({ search: s }),
  setFilters: (f) => set((st) => ({ filters: { ...st.filters, ...f } })),
  resetFilters: () =>
    set({ filters: { category: "", bike: "", brand: "", status: "" } }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
