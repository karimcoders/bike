"use client";

import { useState } from "react";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tags,
  Plus,
  Trash2,
  Package,
  ArrowLeft,
} from "lucide-react";

const COLORS = [
  "#f97316",
  "#ef4444",
  "#eab308",
  "#10b981",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#64748b",
  "#f59e0b",
  "#14b8a6",
  "#3b82f6",
];

export function CategoriesView() {
  const { data, isLoading } = useCategories();
  const create = useCreateCategory();
  const del = useDeleteCategory();
  const { go } = useUI();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const categories = data?.categories || [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color },
      {
        onSuccess: () => {
          setName("");
          setColor(COLORS[0]);
          setOpen(false);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => go("dashboard")} className="md:hidden">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Categories
            </h1>
            <p className="text-sm text-muted-foreground">
              {categories.length} categories
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 rounded-xl shadow-glow" size="lg">
              <Plus className="size-5" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="cat-name">Category Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="e.g. Engine, Brake, Filters"
                  autoFocus
                />
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="size-9 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        outline: color === c ? "3px solid" : "none",
                        outlineOffset: "2px",
                        outlineColor: c,
                      }}
                      aria-label={`color ${c}`}
                    />
                  ))}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="rounded-xl">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  className="rounded-xl"
                  disabled={create.isPending || !name.trim()}
                >
                  Add Category
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((c) => (
            <Card
              key={c.id}
              className="shadow-soft overflow-hidden py-0 relative group"
            >
              <div
                className="h-2 w-full"
                style={{ backgroundColor: c.color || "#f97316" }}
              />
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <span
                    className="flex size-11 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: (c.color || "#f97316") + "22",
                      color: c.color || "#f97316",
                    }}
                  >
                    <Tags className="size-5" />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => del.mutate(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <p className="mt-3 font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package className="size-3" />
                  {c._count?.products || 0} products
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
