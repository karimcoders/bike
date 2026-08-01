"use client";

import { useMemo, useRef, useState } from "react";
import {
  useCustomerDetail,
  useRecordPayment,
  useSettings,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  openWhatsApp,
  buildReminderMessage,
  formatDueDate,
} from "@/lib/whatsapp";
import {
  generatePDF,
  generatePNG,
  downloadBlob,
  openWhatsAppWithReceipt,
  safeFilename,
} from "@/lib/receipt";
import type {
  CustomerDetail,
  LedgerEntry,
  LedgerType,
  Settings,
} from "@/lib/types";
import {
  ArrowLeft,
  User,
  Phone,
  Wallet,
  HandCoins,
  MessageCircle,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt,
  TrendingUp,
  IndianRupee,
  Loader2,
  Clock,
  CreditCard,
  History,
  Users,
  ShoppingBag,
  Send,
  FileText,
  Download,
} from "lucide-react";

function formatINR(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN");
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

const LEDGER_BADGES: Record<
  LedgerType,
  { label: string; cls: string }
> = {
  CREDIT: {
    label: "Udhaar",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  },
  PAYMENT: {
    label: "Payment",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  ADVANCE: {
    label: "Advance",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  ADJUSTMENT: {
    label: "Adjustment",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
};

const STATUS_BADGES: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  PARTIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  PENDING: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

const PAYMENT_BADGES: Record<string, string> = {
  CASH: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  UPI: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  CREDIT: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  SPLIT: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
};

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

// ---- PDF / Statement helpers ----
function formatPdfDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPdfDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function CustomerDetailView() {
  const { selectedCustomerId, go, openSaleBill } = useUI();
  const { data, isLoading, isError } = useCustomerDetail(selectedCustomerId);
  const recordPayment = useRecordPayment();
  const { data: settingsData } = useSettings();
  const settings = settingsData?.settings;

  const [payOpen, setPayOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [advAmount, setAdvAmount] = useState("");
  const [advNote, setAdvNote] = useState("");

  // PDF generation state
  const [generatingStatement, setGeneratingStatement] = useState(false);
  const [generatingLedger, setGeneratingLedger] = useState(false);
  const [generatingWaStatement, setGeneratingWaStatement] = useState(false);

  // Hidden refs for PDF/PNG capture
  const statementRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);

  const customer = data?.customer;

  // Find latest due date from sales (for WhatsApp reminder)
  const latestDueDate = useMemo(() => {
    if (!customer) return null;
    const withDue = customer.sales.filter((s) => s.dueDate);
    if (withDue.length === 0) return null;
    return withDue[0].dueDate; // sales are sorted desc by createdAt
  }, [customer]);

  // ----- Null / loading / error states -----
  if (!selectedCustomerId) {
    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        <BackHeader />
        <Card className="shadow-soft">
          <CardContent className="py-14 text-center">
            <Users className="mx-auto mb-3 size-12 opacity-40" />
            <p className="text-sm font-medium">Koi customer nahi chuna gaya</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Customer list se koi ek chunein
            </p>
            <Button
              className="mt-4 rounded-xl bg-primary text-primary-foreground"
              onClick={() => go("customers")}
            >
              Customers list dekhein
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <BackHeader />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        <BackHeader />
        <Card className="shadow-soft">
          <CardContent className="py-14 text-center">
            <AlertCircle className="mx-auto mb-3 size-12 text-red-500" />
            <p className="text-sm font-medium">Customer load nahi hua</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dobara koshish karein
            </p>
            <Button
              className="mt-4 rounded-xl bg-primary text-primary-foreground"
              onClick={() => go("customers")}
            >
              <ArrowLeft className="size-4" /> Customers list
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initial = customer.name.trim().charAt(0).toUpperCase() || "?";
  const outstanding = customer.outstanding || 0;
  const advance = customer.advance || 0;
  const salesCount = customer._count?.sales || 0;

  // ----- Handlers -----
  const handleReminder = () => {
    if (outstanding <= 0) {
      toast.info("Koi udhaar nahi hai");
      return;
    }
    if (!customer.phone) {
      toast.error("Customer ka phone number nahi hai");
      return;
    }
    const message = buildReminderMessage(
      {
        name: customer.name,
        shop: settings?.shopName || "Bike Parts Shop",
        amount: outstanding,
        date: latestDueDate ? formatDueDate(latestDueDate) : "",
      },
      settings?.whatsappTemplate || undefined
    );
    const ok = openWhatsApp(customer.phone, message);
    if (!ok) {
      toast.error("Sahi phone number nahi hai");
      return;
    }
    toast.success("WhatsApp khul raha hai… Send button dabayein");
  };

  const submitPayment = () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error("Sahi amount likhein");
      return;
    }
    recordPayment.mutate(
      {
        customerId: customer.id,
        type: "PAYMENT",
        amount: amt,
        note: payNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setPayOpen(false);
          setPayAmount("");
          setPayNote("");
        },
      }
    );
  };

  const submitAdvance = () => {
    const amt = Number(advAmount);
    if (!amt || amt <= 0) {
      toast.error("Sahi amount likhein");
      return;
    }
    recordPayment.mutate(
      {
        customerId: customer.id,
        type: "ADVANCE",
        amount: amt,
        note: advNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAdvanceOpen(false);
          setAdvAmount("");
          setAdvNote("");
        },
      }
    );
  };

  const openPayDialog = () => {
    setPayAmount(outstanding > 0 ? String(outstanding) : "");
    setPayNote("");
    setPayOpen(true);
  };

  const openAdvDialog = () => {
    setAdvAmount("");
    setAdvNote("");
    setAdvanceOpen(true);
  };

  // ----- PDF / PNG generation handlers -----
  const handleDownloadStatement = async () => {
    if (!statementRef.current) {
      toast.error("Statement generate nahi ho saka");
      return;
    }
    setGeneratingStatement(true);
    try {
      const { blob } = await generatePDF(statementRef.current, "A4");
      const fname = `udhaar-statement-${safeFilename(customer.name)}.pdf`;
      downloadBlob(blob, fname);
      toast.success("Udhaar statement download ho raha hai");
    } catch (e) {
      console.error(e);
      toast.error("PDF bana nahi paaya. Dobara try karein.");
    } finally {
      setGeneratingStatement(false);
    }
  };

  const handleDownloadLedger = async () => {
    if (!ledgerRef.current) {
      toast.error("Ledger generate nahi ho saka");
      return;
    }
    setGeneratingLedger(true);
    try {
      const { blob } = await generatePDF(ledgerRef.current, "A4");
      const fname = `ledger-${safeFilename(customer.name)}.pdf`;
      downloadBlob(blob, fname);
      toast.success("Ledger PDF download ho raha hai");
    } catch (e) {
      console.error(e);
      toast.error("PDF bana nahi paaya. Dobara try karein.");
    } finally {
      setGeneratingLedger(false);
    }
  };

  const handleWhatsAppStatement = async () => {
    if (!statementRef.current) {
      toast.error("Statement generate nahi ho saka");
      return;
    }
    if (!customer.phone) {
      toast.error("Customer ka phone number nahi hai");
      return;
    }
    setGeneratingWaStatement(true);
    try {
      const { blob } = await generatePNG(statementRef.current, "A4");
      const message = buildReminderMessage({
        name: customer.name,
        shop: settings?.shopName || "Bike Parts Shop",
        amount: outstanding,
        date: latestDueDate ? formatDueDate(latestDueDate) : "",
      });
      openWhatsAppWithReceipt(
        customer.phone,
        message,
        blob,
        `udhaar-statement-${safeFilename(customer.name)}.png`
      );
      toast.success(
        "Statement image download ho raha hai. WhatsApp me attach karke Send karein"
      );
    } catch (e) {
      console.error(e);
      toast.error("Image bana nahi paaya. Dobara try karein.");
    } finally {
      setGeneratingWaStatement(false);
    }
  };

  const payAmtNum = Number(payAmount) || 0;
  const excess = payAmtNum > outstanding ? payAmtNum - outstanding : 0;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <BackHeader />

      {/* Customer header card */}
      <Card className="shadow-soft">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary text-2xl font-bold uppercase">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight truncate">
                  {customer.name}
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full text-[10px] px-2",
                    typeBadgeClass(customer.type)
                  )}
                >
                  {(customer.type || "MECHANIC").toUpperCase()}
                </Badge>
              </div>
              {customer.phone ? (
                <a
                  href={`tel:${customer.phone}`}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mt-1"
                >
                  <Phone className="size-3.5" /> {customer.phone}
                </a>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  No phone number
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Calendar className="size-3" /> Joined{" "}
                {new Date(customer.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <Separator />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className={cn(
                "rounded-xl p-3 border",
                outstanding > 0
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20"
              )}
            >
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <AlertCircle className="size-3" /> Outstanding
              </p>
              {outstanding > 0 ? (
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {formatINR(outstanding)}
                </p>
              ) : (
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="size-4" /> No dues
                </p>
              )}
            </div>
            <div
              className={cn(
                "rounded-xl p-3 border",
                advance > 0
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-muted/40 border-border"
              )}
            >
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <HandCoins className="size-3" /> Advance
              </p>
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  advance > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
              >
                {formatINR(advance)}
              </p>
            </div>
            <div className="rounded-xl p-3 border bg-muted/40 border-border">
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <ShoppingBag className="size-3" /> Total Bills
              </p>
              <p className="text-lg font-bold tabular-nums">{salesCount}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Button
              onClick={openPayDialog}
              className="h-11 rounded-xl bg-primary text-primary-foreground shadow-soft touch-target"
            >
              <Wallet className="size-4" /> Record Payment
            </Button>
            <Button
              onClick={openAdvDialog}
              variant="outline"
              className="h-11 rounded-xl touch-target"
            >
              <HandCoins className="size-4" /> Add Advance
            </Button>
            <Button
              onClick={handleReminder}
              className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft touch-target"
            >
              <MessageCircle className="size-4" /> WhatsApp Reminder
            </Button>
            <Button
              onClick={handleDownloadStatement}
              disabled={generatingStatement}
              className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-soft touch-target"
            >
              {generatingStatement ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Bana raha hai...
                </>
              ) : (
                <>
                  <FileText className="size-4" /> Udhaar Statement
                </>
              )}
            </Button>
            <Button
              onClick={handleDownloadLedger}
              disabled={generatingLedger}
              variant="outline"
              className="h-11 rounded-xl touch-target"
            >
              {generatingLedger ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Bana raha hai...
                </>
              ) : (
                <>
                  <History className="size-4" /> Ledger PDF
                </>
              )}
            </Button>
            <Button
              onClick={handleWhatsAppStatement}
              disabled={generatingWaStatement}
              className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft touch-target"
            >
              {generatingWaStatement ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Bana raha hai...
                </>
              ) : (
                <>
                  <Download className="size-4" /> WhatsApp Statement
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Ledger section */}
        <Card className="shadow-soft">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" />
              Ledger / Hisab
            </CardTitle>
            <Badge variant="secondary" className="rounded-full text-xs">
              {customer.ledger.length} entries
            </Badge>
          </CardHeader>
          <CardContent>
            {customer.ledger.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <History className="mx-auto mb-2 size-8 opacity-40" />
                Abhi koi ledger entry nahi hai
                <p className="mt-1 text-xs">
                  Payment ya advance record karne par yahan dikhega
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin pr-1">
                {customer.ledger.map((e) => {
                  const badge = LEDGER_BADGES[e.type] || LEDGER_BADGES.CREDIT;
                  const amt = e.amount || 0;
                  const absAmt = Math.abs(amt);
                  const isCredit = e.type === "CREDIT" || e.type === "ADJUSTMENT";
                  const overdue = isOverdue(e.dueDate) && outstanding > 0;
                  return (
                    <div
                      key={e.id}
                      className="rounded-xl border border-border p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-full text-[10px] px-2",
                                badge.cls
                              )}
                            >
                              {badge.label}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                              <Clock className="size-3" />
                              {timeAgo(e.createdAt)}
                            </span>
                          </div>
                          {e.note && (
                            <p className="text-xs mt-1 text-foreground/80">
                              {e.note}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              "text-sm font-bold tabular-nums",
                              isCredit
                                ? "text-red-600 dark:text-red-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {isCredit ? "+" : "-"}
                            {formatINR(absAmt)}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            Bal: {formatINR(e.balance)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.dueDate && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md border",
                              overdue
                                ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
                                : "bg-muted/60 text-muted-foreground border-border"
                            )}
                          >
                            <Calendar className="size-3" />
                            {formatDueDate(e.dueDate)}
                            {overdue && " · Overdue"}
                          </span>
                        )}
                        {e.saleId && e.sale && (
                          <button
                            onClick={() => openSaleBill(e.saleId!)}
                            className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md border bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                          >
                            <Receipt className="size-3" />
                            {e.sale.invoiceNo}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent sales section */}
        <Card className="shadow-soft">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="size-4 text-primary" />
              Recent Bills
            </CardTitle>
            <Badge variant="secondary" className="rounded-full text-xs">
              {customer.sales.length} shown
            </Badge>
          </CardHeader>
          <CardContent>
            {customer.sales.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Receipt className="mx-auto mb-2 size-8 opacity-40" />
                Abhi koi bill nahi hai
                <p className="mt-1 text-xs">
                  Sell screen se billing karke dekhein
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin pr-1">
                {customer.sales.map((s) => {
                  const statusCls =
                    STATUS_BADGES[s.status] || STATUS_BADGES.PENDING;
                  const payCls =
                    PAYMENT_BADGES[s.paymentMode] || PAYMENT_BADGES.CASH;
                  return (
                    <button
                      key={s.id}
                      onClick={() => openSaleBill(s.id)}
                      className="w-full text-left rounded-xl border border-border p-3 space-y-2 hover:bg-accent transition-colors touch-target"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold font-mono">
                            {s.invoiceNo}
                          </p>
                          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                            <Clock className="size-3" /> {timeAgo(s.createdAt)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold tabular-nums">
                            {formatINR(s.total)}
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 tabular-nums">
                            <TrendingUp className="size-3" />
                            +{formatINR(s.profit)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-[10px] px-2",
                            statusCls
                          )}
                        >
                          {s.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-[10px] px-2",
                            payCls
                          )}
                        >
                          <CreditCard className="size-2.5" />
                          {s.paymentMode}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5 ml-auto">
                          <ShoppingBag className="size-3" />
                          {s.itemCount} item{s.itemCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Dialog */}
      <Dialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) {
            setPayAmount("");
            setPayNote("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              Payment Record karein
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <AlertCircle className="size-3.5" /> Current Outstanding
              </span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  outstanding > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {formatINR(outstanding)}
              </span>
            </div>
            <div>
              <Label className="text-sm">Amount (₹)</Label>
              <div className="relative mt-1">
                <IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-12 pl-10 rounded-xl text-base tabular-nums"
                  placeholder="0"
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              {excess > 0 && (
                <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                  <HandCoins className="size-3" />
                  Extra {formatINR(excess)} advance me add ho jayega
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm">Note (optional)</Label>
              <Textarea
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="mt-1 rounded-xl min-h-16"
                placeholder="Cash, UPI, etc..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPayOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground"
              onClick={submitPayment}
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Send className="size-4" /> Record Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Dialog */}
      <Dialog
        open={advanceOpen}
        onOpenChange={(o) => {
          setAdvanceOpen(o);
          if (!o) {
            setAdvAmount("");
            setAdvNote("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="size-5 text-emerald-600" />
              Advance Add karein
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Amount (₹)</Label>
              <div className="relative mt-1">
                <IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value)}
                  className="h-12 pl-10 rounded-xl text-base tabular-nums"
                  placeholder="0"
                  inputMode="numeric"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Note (optional)</Label>
              <Textarea
                value={advNote}
                onChange={(e) => setAdvNote(e.target.value)}
                className="mt-1 rounded-xl min-h-16"
                placeholder="Advance ka reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setAdvanceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={submitAdvance}
              disabled={recordPayment.isPending}
            >
              {recordPayment.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Send className="size-4" /> Add Advance
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Hidden PDF capture containers (off-screen, for html2canvas) ===== */}
      <div
        ref={statementRef}
        aria-hidden
        style={{
          position: "fixed",
          left: "-99999px",
          top: 0,
          width: 600,
          background: "#ffffff",
        }}
      >
        <UdhaarStatementDoc customer={customer} settings={settings} />
      </div>
      <div
        ref={ledgerRef}
        aria-hidden
        style={{
          position: "fixed",
          left: "-99999px",
          top: 0,
          width: 600,
          background: "#ffffff",
        }}
      >
        <LedgerPdfDoc customer={customer} settings={settings} />
      </div>
    </div>
  );
}

function BackHeader() {
  const { go } = useUI();
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => go("customers")}
        className="touch-target"
      >
        <ArrowLeft className="size-4" /> Back
      </Button>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <User className="size-4" /> Customer Detail
      </div>
    </div>
  );
}

// =====================================================================
// HIDDEN PDF COMPONENTS — rendered off-screen, captured via html2canvas
// =====================================================================

const PDF_FONT_FAMILY = "'Menlo', 'Consolas', 'Courier New', monospace";

function PdfShopHeader({ settings }: { settings: Settings | undefined }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 6 }}>
      {settings?.logo && (
        <img
          src={settings.logo}
          alt="logo"
          crossOrigin="anonymous"
          style={{
            maxWidth: 60,
            maxHeight: 60,
            objectFit: "contain",
            marginBottom: 4,
          }}
        />
      )}
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>
        {settings?.shopName || "Bike Parts Shop"}
      </div>
      {settings?.ownerName && (
        <div style={{ fontSize: 11 }}>Prop: {settings.ownerName}</div>
      )}
      {settings?.address && (
        <div style={{ fontSize: 11 }}>{settings.address}</div>
      )}
      {settings?.phone && (
        <div style={{ fontSize: 11 }}>📞 {settings.phone}</div>
      )}
      {settings?.gstNumber && (
        <div style={{ fontSize: 11 }}>GST: {settings.gstNumber}</div>
      )}
    </div>
  );
}

function PdfSep({
  color = "#000",
  margin = "6px 0",
}: {
  color?: string;
  margin?: string;
}) {
  return (
    <div
      style={{
        borderTop: `1px dashed ${color}`,
        margin,
        opacity: 0.5,
      }}
    />
  );
}

function PdfFooter({ settings }: { settings: Settings | undefined }) {
  return (
    <div style={{ textAlign: "center", marginTop: 10, fontSize: 10 }}>
      <div style={{ fontWeight: 700 }}>🙏 Dhanyawad 🙏</div>
      <div style={{ marginTop: 2 }}>
        {settings?.shopName || "Bike Parts Shop"} · {settings?.phone || ""}
      </div>
      <div style={{ marginTop: 2, opacity: 0.6, fontSize: 9 }}>
        Generated: {formatPdfDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}

// ---- Udhaar Statement PDF ----
function UdhaarStatementDoc({
  customer,
  settings,
}: {
  customer: CustomerDetail;
  settings: Settings | undefined;
}) {
  const outstanding = customer.outstanding || 0;
  const advance = customer.advance || 0;
  const salesCount = customer._count?.sales || 0;

  // Recent credit bills (CREDIT or SPLIT payment with creditAmount > 0)
  // Sales are typically sorted desc by createdAt, but we re-sort to be safe
  const creditSales = useMemo(() => {
    return customer.sales
      .filter(
        (s) =>
          s.paymentMode === "CREDIT" ||
          (s.paymentMode === "SPLIT" && s.creditAmount > 0)
      )
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 10);
  }, [customer.sales]);

  const overdueBills = creditSales.filter(
    (s) =>
      s.dueDate &&
      new Date(s.dueDate).getTime() < Date.now() &&
      s.total - s.paidAmount > 0
  );
  const overdueAmount = overdueBills.reduce(
    (sum, s) => sum + Math.max(0, s.total - s.paidAmount),
    0
  );

  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000",
        fontFamily: PDF_FONT_FAMILY,
        padding: "16px 14px",
        boxSizing: "border-box",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <PdfShopHeader settings={settings} />
      <PdfSep color="#000" margin="4px 0" />
      <div
        style={{
          textAlign: "center",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        UDHAAR STATEMENT
      </div>
      <PdfSep color="#000" margin="4px 0" />

      {/* Customer info */}
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        <div>
          <b>Customer:</b> {customer.name} (
          {(customer.type || "MECHANIC").toUpperCase()})
        </div>
        <div>
          <b>Phone:</b> {customer.phone || "N/A"}
        </div>
        <div>
          <b>Member since:</b> {formatPdfDate(customer.createdAt)}
        </div>
      </div>

      <PdfSep />

      {/* Highlighted summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: 8,
            border: "2px solid #dc2626",
            borderRadius: 4,
            background: "#fef2f2",
          }}
        >
          <div style={{ fontSize: 10, color: "#7f1d1d" }}>
            Current Outstanding
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#dc2626",
            }}
          >
            {formatINR(outstanding)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: 8,
            border: "1px solid #16a34a",
            borderRadius: 4,
            background: "#f0fdf4",
          }}
        >
          <div style={{ fontSize: 10, color: "#14532d" }}>Advance Paid</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a" }}>
            {formatINR(advance)}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            padding: 8,
            border: "1px solid #000",
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: 10 }}>Total Bills</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{salesCount}</div>
        </div>
      </div>

      <PdfSep />

      {/* Recent credit bills */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        RECENT CREDIT BILLS (last 10):
      </div>
      {creditSales.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            padding: 8,
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          Koi credit bill nahi hai
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #000" }}>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Invoice</th>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Date</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>Paid</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>
                Remaining
              </th>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {creditSales.map((s) => {
              const remaining = Math.max(0, s.total - s.paidAmount);
              const isOverdue =
                !!s.dueDate &&
                new Date(s.dueDate).getTime() < Date.now() &&
                remaining > 0;
              return (
                <tr key={s.id} style={{ borderBottom: "1px dashed #ccc" }}>
                  <td style={{ padding: "3px 3px" }}>{s.invoiceNo}</td>
                  <td style={{ padding: "3px 3px" }}>
                    {formatPdfDate(s.createdAt)}
                  </td>
                  <td style={{ padding: "3px 3px", textAlign: "right" }}>
                    {formatINR(s.total)}
                  </td>
                  <td style={{ padding: "3px 3px", textAlign: "right" }}>
                    {formatINR(s.paidAmount)}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      textAlign: "right",
                      fontWeight: 700,
                      color: "#dc2626",
                    }}
                  >
                    {formatINR(remaining)}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      color: isOverdue ? "#dc2626" : "#000",
                      fontWeight: isOverdue ? 700 : 400,
                    }}
                  >
                    {formatPdfDate(s.dueDate)}
                    {isOverdue ? " (OVERDUE)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PdfSep />

      {/* Summary */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        SUMMARY:
      </div>
      <div style={{ fontSize: 11 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Total Outstanding:</span>
          <span style={{ fontWeight: 800, color: "#dc2626" }}>
            {formatINR(outstanding)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Overdue Amount:</span>
          <span
            style={{
              fontWeight: 700,
              color: overdueAmount > 0 ? "#dc2626" : "#16a34a",
            }}
          >
            {formatINR(overdueAmount)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Number of Overdue Bills:</span>
          <span style={{ fontWeight: 700 }}>{overdueBills.length}</span>
        </div>
      </div>

      <PdfSep />

      {/* Closing message */}
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          marginTop: 6,
          fontStyle: "italic",
        }}
      >
        Please pay before due date.
        <br />
        Contact shop for any discrepancies.
      </div>

      <PdfFooter settings={settings} />
    </div>
  );
}

// ---- Customer Ledger PDF ----
function LedgerPdfDoc({
  customer,
  settings,
}: {
  customer: CustomerDetail;
  settings: Settings | undefined;
}) {
  // Sort ledger ascending by createdAt (chronological order)
  const sortedLedger = useMemo(() => {
    return customer.ledger
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }, [customer.ledger]);

  // Sum by type (use absolute value since PAYMENT/ADVANCE are stored as negative)
  const totals = useMemo(() => {
    let credit = 0,
      payment = 0,
      advance = 0;
    for (const e of sortedLedger) {
      const amt = Math.abs(e.amount || 0);
      if (e.type === "CREDIT") credit += amt;
      else if (e.type === "PAYMENT") payment += amt;
      else if (e.type === "ADVANCE") advance += amt;
    }
    return { credit, payment, advance };
  }, [sortedLedger]);

  const periodStart =
    sortedLedger.length > 0 ? sortedLedger[0].createdAt : null;
  const periodEnd =
    sortedLedger.length > 0
      ? sortedLedger[sortedLedger.length - 1].createdAt
      : null;

  const currentOutstanding = customer.outstanding || 0;
  const currentAdvance = customer.advance || 0;

  const ledgerTypeLabel = (t: LedgerType): string => {
    switch (t) {
      case "CREDIT":
        return "Udhaar";
      case "PAYMENT":
        return "Payment";
      case "ADVANCE":
        return "Advance";
      case "ADJUSTMENT":
        return "Adjustment";
      default:
        return t;
    }
  };

  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000",
        fontFamily: PDF_FONT_FAMILY,
        padding: "16px 14px",
        boxSizing: "border-box",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <PdfShopHeader settings={settings} />
      <PdfSep color="#000" margin="4px 0" />
      <div
        style={{
          textAlign: "center",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        LEDGER HISTORY
      </div>
      <PdfSep color="#000" margin="4px 0" />

      {/* Customer info */}
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        <div>
          <b>Customer:</b> {customer.name} (
          {(customer.type || "MECHANIC").toUpperCase()})
        </div>
        <div>
          <b>Phone:</b> {customer.phone || "N/A"}
        </div>
      </div>

      <PdfSep />

      {/* Period info */}
      <div style={{ fontSize: 11, marginBottom: 4 }}>
        <div>
          <b>Period:</b>{" "}
          {sortedLedger.length > 0
            ? `${formatPdfDate(periodStart)} to ${formatPdfDate(periodEnd)}`
            : "No transactions"}
        </div>
        <div>
          <b>Opening Balance:</b> ₹0
        </div>
      </div>

      <PdfSep />

      {/* Transactions table */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        ALL TRANSACTIONS (chronological):
      </div>
      {sortedLedger.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            padding: 8,
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          Abhi koi transaction nahi hai
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #000" }}>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Date</th>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Type</th>
              <th style={{ padding: "4px 3px", textAlign: "left" }}>Note</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>Debit</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>Credit</th>
              <th style={{ padding: "4px 3px", textAlign: "right" }}>
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedLedger.map((e: LedgerEntry) => {
              const amt = Math.abs(e.amount || 0);
              const isDebit = e.type === "CREDIT" || e.type === "ADJUSTMENT";
              const debit = isDebit ? formatINR(amt) : "-";
              const credit = !isDebit ? formatINR(amt) : "-";
              const noteText =
                e.note || (e.sale?.invoiceNo ? `Bill: ${e.sale.invoiceNo}` : "");
              return (
                <tr key={e.id} style={{ borderBottom: "1px dashed #ccc" }}>
                  <td style={{ padding: "3px 3px" }}>
                    {formatPdfDate(e.createdAt)}
                  </td>
                  <td style={{ padding: "3px 3px" }}>
                    {ledgerTypeLabel(e.type)}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {noteText}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      textAlign: "right",
                      color: "#dc2626",
                    }}
                  >
                    {debit}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      textAlign: "right",
                      color: "#16a34a",
                    }}
                  >
                    {credit}
                  </td>
                  <td
                    style={{
                      padding: "3px 3px",
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  >
                    {formatINR(e.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PdfSep />

      {/* Summary */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        SUMMARY:
      </div>
      <div style={{ fontSize: 11 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Total Udhaar (Credit):</span>
          <span style={{ fontWeight: 700, color: "#dc2626" }}>
            {formatINR(totals.credit)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Total Payments:</span>
          <span style={{ fontWeight: 700, color: "#16a34a" }}>
            {formatINR(totals.payment)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span>Total Advance:</span>
          <span style={{ fontWeight: 700, color: "#16a34a" }}>
            {formatINR(totals.advance)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
            borderTop: "1px solid #000",
            marginTop: 2,
            paddingTop: 2,
          }}
        >
          <span style={{ fontWeight: 800 }}>Current Outstanding:</span>
          <span
            style={{
              fontWeight: 800,
              color: currentOutstanding > 0 ? "#dc2626" : "#16a34a",
            }}
          >
            {formatINR(currentOutstanding)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
          }}
        >
          <span style={{ fontWeight: 800 }}>Current Advance:</span>
          <span
            style={{
              fontWeight: 800,
              color: currentAdvance > 0 ? "#16a34a" : "#000",
            }}
          >
            {formatINR(currentAdvance)}
          </span>
        </div>
      </div>

      <PdfFooter settings={settings} />
    </div>
  );
}
