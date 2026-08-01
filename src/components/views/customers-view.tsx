"use client";

import { useMemo, useState } from "react";
import { useCustomers, useCreateCustomer } from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users,
  User,
  UserPlus,
  Phone,
  Search,
  Plus,
  AlertCircle,
  HandCoins,
  Loader2,
  ShoppingBag,
} from "lucide-react";

function formatINR(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN");
}

const TYPE_BADGES: Record<string, string> = {
  MECHANIC:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  RETAIL:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  WHOLESALE:
    "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
};

function typeBadgeClass(type: string) {
  return (
    TYPE_BADGES[(type || "MECHANIC").toUpperCase()] || TYPE_BADGES.MECHANIC
  );
}

export function CustomersView() {
  const { data, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const { openCustomer } = useUI();

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("MECHANIC");
  const [newNotes, setNewNotes] = useState("");

  const customers = data?.customers || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }, [customers, query]);

  const totalOutstanding = customers.reduce(
    (s, c) => s + (c.outstanding || 0),
    0
  );
  const totalAdvance = customers.reduce((s, c) => s + (c.advance || 0), 0);

  const resetForm = () => {
    setNewName("");
    setNewPhone("");
    setNewType("MECHANIC");
    setNewNotes("");
  };

  const submitAdd = () => {
    if (!newName.trim()) {
      toast.error("Customer ka naam likhein");
      return;
    }
    createCustomer.mutate(
      {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        type: newType,
        notes: newNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          resetForm();
        },
      }
    );
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
            <Users className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Customers
            </h1>
            <p className="text-sm text-muted-foreground">
              Aapke customers aur udhaar
            </p>
          </div>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="h-11 rounded-xl bg-primary text-primary-foreground shadow-soft touch-target"
        >
          <UserPlus className="size-4" />
          Add Customer
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-soft">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Customers</p>
              <p className="text-xl font-bold leading-tight">
                {customers.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertCircle className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Udhaar</p>
              <p className="text-xl font-bold leading-tight text-red-600 dark:text-red-400">
                {formatINR(totalOutstanding)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <HandCoins className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Advance</p>
              <p className="text-xl font-bold leading-tight text-emerald-600 dark:text-emerald-400">
                {formatINR(totalAdvance)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 pl-11 rounded-xl text-base"
          placeholder="Naam ya phone se search karein..."
        />
      </div>

      {/* Customer list */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 size-10 opacity-40" />
            {query ? "Koi customer nahi mila" : "Abhi koi customer nahi hai"}
            <p className="mt-1 text-xs">
              {query
                ? "Doosra naam try karein"
                : "Naya customer add karke shuruaat karein"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((c) => {
            const initial = c.name.trim().charAt(0).toUpperCase() || "?";
            const salesCount = c._count?.sales || 0;
            return (
              <button
                key={c.id}
                onClick={() => openCustomer(c.id)}
                className="text-left touch-target rounded-2xl"
                aria-label={`Open ${c.name}`}
              >
                <Card className="shadow-soft hover:shadow-glow hover:border-primary/40 transition-all h-full">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold uppercase">
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="truncate font-semibold">{c.name}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px] px-2",
                              typeBadgeClass(c.type)
                            )}
                          >
                            {(c.type || "MECHANIC").toUpperCase()}
                          </Badge>
                        </div>
                        {c.phone ? (
                          <p className="truncate text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                            <Phone className="size-3" /> {c.phone}
                          </p>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            No phone
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div
                        className={cn(
                          "rounded-lg p-2 border",
                          c.outstanding > 0
                            ? "bg-red-500/10 border-red-500/20"
                            : "bg-muted/40 border-border"
                        )}
                      >
                        <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                          <AlertCircle className="size-2.5" /> Udhaar
                        </p>
                        <p
                          className={cn(
                            "font-bold tabular-nums",
                            c.outstanding > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatINR(c.outstanding)}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "rounded-lg p-2 border",
                          c.advance > 0
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : "bg-muted/40 border-border"
                        )}
                      >
                        <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                          <Plus className="size-2.5" /> Advance
                        </p>
                        <p
                          className={cn(
                            "font-bold tabular-nums",
                            c.advance > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatINR(c.advance)}
                        </p>
                      </div>
                      <div className="rounded-lg p-2 border bg-muted/40 border-border">
                        <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                          <ShoppingBag className="size-2.5" /> Bills
                        </p>
                        <p className="font-bold tabular-nums">{salesCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Add Customer Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Naya Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Customer ka naam</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-11 pl-10 rounded-xl"
                  placeholder="Mechanic ya customer ka naam"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Phone number</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="h-11 pl-10 rounded-xl"
                  placeholder="Mobile number"
                  inputMode="tel"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Customer type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-11 w-full rounded-xl mt-1">
                  <SelectValue placeholder="Type chunein" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MECHANIC">MECHANIC (Mechanic)</SelectItem>
                  <SelectItem value="RETAIL">RETAIL (Walk-in)</SelectItem>
                  <SelectItem value="WHOLESALE">WHOLESALE (Dealer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Notes</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="mt-1 rounded-xl min-h-20"
                placeholder="Khaas baat ya reference..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setAddOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground"
              onClick={submitAdd}
              disabled={createCustomer.isPending}
            >
              {createCustomer.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Customer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
