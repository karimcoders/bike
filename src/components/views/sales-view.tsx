"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  useAllProducts,
  useCustomers,
  useCreateCustomer,
  useCreateSale,
  useSales,
  useSettings,
  useReceiptMessage,
  useRecognizeProduct,
  fileToDataUrl,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockBadge } from "@/components/stock-badge";
import { SafeImage } from "@/components/ui/safe-image";
import { BillReceipt } from "@/components/receipt/bill-receipt";
// BarcodeScanner pulls in @zxing/browser (heavy). Lazy-load it so the
// ZXing chunk only downloads the first time the owner opens the scanner —
// not on every Sell-screen mount.
const BarcodeScanner = dynamic(
  () => import("@/components/barcode-scanner").then((m) => m.BarcodeScanner),
  { ssr: false }
);
import { getPrimaryPhoto, type Product, type Sale, type Settings, type PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildBillMessage, normalizePhone } from "@/lib/whatsapp";
import {
  parseReceiptSize,
  generatePDF,
  generatePNG,
  downloadBlob,
  printBlob,
  openWhatsAppWithReceipt,
  safeFilename,
} from "@/lib/receipt";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  X,
  Trash2,
  Package,
  User,
  UserPlus,
  Phone,
  Receipt,
  TrendingUp,
  Loader2,
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  CheckCircle2,
  ShoppingBag,
  Banknote,
  QrCode,
  HandCoins,
  Split,
  Printer,
  MessageCircle,
  Download,
  Image as ImageIcon,
  Calendar,
  Check,
  Percent,
  AlertCircle,
  ScanLine,
  Camera,
  Sparkles,
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

function formatBillDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type CartItem = {
  product: Product;
  qty: number;
};

type PaymentModeKey = "CASH" | "UPI" | "CREDIT" | "SPLIT";

// Fallback settings used when the real settings haven't loaded yet.
// BillReceipt requires a full Settings object (non-optional).
const DEFAULT_SETTINGS: Settings = {
  id: "",
  shopName: "Bike Parts Shop",
  ownerName: "",
  address: "",
  phone: "",
  currency: "INR",
  theme: "light",
  logo: null,
  upiId: null,
  upiQrImage: null,
  upiApps: "",
  gstNumber: null,
  receiptSize: "58",
  printerType: "thermal",
  whatsappEnabled: false,
  whatsappTemplate: "",
  thankYouTemplate: "",
  billTemplate: "",
  smsEnabled: false,
  backupEnabled: false,
  billFooter: "Dhanyawad! Phir aayein.",
};

// Compute payment params for the createSale payload
function computePaymentPayload(
  mode: PaymentModeKey,
  total: number,
  opts: {
    cashReceived: number;
    creditPaid: number;
    splitCash: number;
    splitUpi: number;
    dueDate: string;
    creditNote: string;
  }
) {
  if (mode === "CASH") {
    // IMPORTANT: cashAmount must be the ACTUAL amount the customer handed over
    // (opts.cashReceived), NOT the bill total. The receipt's "Return (चलो)"
    // line is computed as `cashAmount - total`. If we store `total` here,
    // the return amount is always 0 and the change-to-give-back never shows
    // on the printed bill — even when the customer paid more than the total.
    // Example: total=120, customer gave 200 → cashAmount=200, return=80.
    return {
      paymentMode: "CASH" as PaymentMode,
      paidAmount: opts.cashReceived,
      cashAmount: opts.cashReceived,
      upiAmount: 0,
      creditAmount: 0,
      dueDate: undefined,
      note: opts.creditNote || undefined,
    };
  }
  if (mode === "UPI") {
    return {
      paymentMode: "UPI" as PaymentMode,
      paidAmount: total,
      cashAmount: 0,
      upiAmount: total,
      creditAmount: 0,
      dueDate: undefined,
      note: opts.creditNote || undefined,
    };
  }
  if (mode === "CREDIT") {
    const paid = Math.max(0, opts.creditPaid);
    const remaining = Math.max(0, total - paid);
    return {
      paymentMode: (paid === 0 ? "CREDIT" : "SPLIT") as PaymentMode,
      paidAmount: paid,
      cashAmount: paid,
      upiAmount: 0,
      creditAmount: remaining,
      dueDate: opts.dueDate || undefined,
      note: opts.creditNote || undefined,
    };
  }
  // SPLIT
  const cash = Math.max(0, opts.splitCash);
  const upi = Math.max(0, opts.splitUpi);
  const credit = Math.max(0, total - cash - upi);
  return {
    paymentMode: "SPLIT" as PaymentMode,
    paidAmount: cash + upi,
    cashAmount: cash,
    upiAmount: upi,
    creditAmount: credit,
    dueDate: credit > 0 ? opts.dueDate || undefined : undefined,
    note: opts.creditNote || undefined,
  };
}

// ---- Payment Dialog ----
function PaymentDialog({
  open,
  onOpenChange,
  subtotal,
  settings,
  hasCustomer,
  customerName,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subtotal: number;
  settings: Settings | undefined;
  hasCustomer: boolean;
  customerName: string;
  onConfirm: (payload: {
    paymentMode: PaymentMode;
    paidAmount: number;
    discount: number;
    cashAmount: number;
    upiAmount: number;
    creditAmount: number;
    dueDate?: string;
    note?: string;
  }) => void;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<PaymentModeKey>("CASH");
  const [discount, setDiscount] = useState<string>("");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [creditPaid, setCreditPaid] = useState<string>("0");
  const [dueDate, setDueDate] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");
  const [splitCash, setSplitCash] = useState<string>("0");
  const [splitUpi, setSplitUpi] = useState<string>("0");

  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);

  const cashReceivedNum = Number(cashReceived) || 0;
  const creditPaidNum = Math.max(0, Number(creditPaid) || 0);
  const splitCashNum = Math.max(0, Number(splitCash) || 0);
  const splitUpiNum = Math.max(0, Number(splitUpi) || 0);
  const splitCredit = Math.max(0, total - splitCashNum - splitUpiNum);

  const cashReturn = Math.max(0, cashReceivedNum - total);
  const cashShort = cashReceivedNum < total && cashReceived !== "";

  // Validation
  const creditNeedsCustomer = mode === "CREDIT" && !hasCustomer;
  const splitNeedsCustomer = mode === "SPLIT" && splitCredit > 0 && !hasCustomer;
  const cashInvalid = mode === "CASH" && (cashReceived === "" || cashShort);
  const creditDueMissing =
    mode === "CREDIT" && creditPaidNum < total && !dueDate;
  const splitDueMissing =
    mode === "SPLIT" && splitCredit > 0 && !dueDate;
  const splitOver = splitCashNum + splitUpiNum > total;

  const canConfirm = !(
    cashInvalid ||
    creditNeedsCustomer ||
    splitNeedsCustomer ||
    creditDueMissing ||
    splitDueMissing ||
    splitOver
  );

  const handleConfirm = () => {
    if (!canConfirm) {
      if (cashInvalid) {
        toast.error("Received amount total se kam hai");
      } else if (creditNeedsCustomer) {
        toast.error("Credit ke liye customer chunein");
      } else if (splitNeedsCustomer) {
        toast.error("Split credit ke liye customer chunein");
      } else if (creditDueMissing) {
        toast.error("Due date select karein");
      } else if (splitDueMissing) {
        toast.error("Credit portion ke liye due date chunein");
      } else if (splitOver) {
        toast.error("Cash + UPI total se zyada hai");
      }
      return;
    }
    const payload = computePaymentPayload(mode, total, {
      cashReceived: cashReceivedNum,
      creditPaid: creditPaidNum,
      splitCash: splitCashNum,
      splitUpi: splitUpiNum,
      dueDate,
      creditNote,
    });
    onConfirm({ ...payload, discount: discountNum });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      // reset on close
      setMode("CASH");
      setDiscount("");
      setCashReceived("");
      setCreditPaid("0");
      setDueDate("");
      setCreditNote("");
      setSplitCash("0");
      setSplitUpi("0");
    }
    onOpenChange(v);
  };

  const modeCards: {
    key: PaymentModeKey;
    label: string;
    desc: string;
    icon: React.ReactNode;
    disabled?: boolean;
    disabledReason?: string;
  }[] = [
    {
      key: "CASH",
      label: "Cash",
      desc: "Nagi payment",
      icon: <Banknote className="size-5" />,
    },
    {
      key: "UPI",
      label: "UPI QR",
      desc: "Scan & pay",
      icon: <QrCode className="size-5" />,
    },
    {
      key: "CREDIT",
      label: "Credit (Udhaar)",
      desc: "Baad me denge",
      icon: <HandCoins className="size-5" />,
      disabled: !hasCustomer,
      disabledReason: "Customer chunein",
    },
    {
      key: "SPLIT",
      label: "Split Payment",
      desc: "Cash + UPI + Credit",
      icon: <Split className="size-5" />,
      disabled: !hasCustomer,
      disabledReason: "Customer chunein",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg max-h-[92vh] overflow-y-auto scroll-thin"
        showCloseButton={!isPending}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="size-5 text-primary" />
            Payment
          </DialogTitle>
          <DialogDescription>
            Customer:{" "}
            <span className="font-medium text-foreground">
              {customerName}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Discount + Total */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Subtotal
              </Label>
              <span className="text-sm font-medium">
                {formatINR(subtotal)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="disc"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 w-20"
              >
                <Percent className="size-3" /> Discount
              </Label>
              <Input
                id="disc"
                type="number"
                min={0}
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="h-9 rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-border pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-2xl font-bold tracking-tight text-primary">
                {formatINR(total)}
              </span>
            </div>
          </div>

          {/* Payment Mode Cards */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              Payment Mode
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {modeCards.map((m) => {
                const active = mode === m.key;
                const disabled = m.disabled;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => !disabled && setMode(m.key)}
                    disabled={disabled}
                    className={cn(
                      "relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition-all min-h-[64px]",
                      active
                        ? "border-primary bg-primary/5 shadow-soft"
                        : "border-border hover:bg-accent",
                      disabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {m.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">
                        {m.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {m.desc}
                      </p>
                    </div>
                    {disabled && m.disabledReason && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-medium text-amber-600 bg-amber-500/10 rounded px-1 py-0.5">
                        {m.disabledReason}
                      </span>
                    )}
                    {active && (
                      <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode-specific fields */}
          {mode === "CASH" && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{formatINR(total)}</span>
              </div>
              <div>
                <Label className="text-xs">Received (Customer kitna diya)</Label>
                <div className="relative mt-1">
                  <IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={String(total)}
                    className="h-11 pl-10 rounded-xl text-base font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-dashed border-border pt-2">
                <span className="text-muted-foreground">Return</span>
                <span
                  className={cn(
                    "font-bold",
                    cashShort ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {formatINR(cashReturn)}
                </span>
              </div>
              {cashShort && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3.5" />
                  Received total se kam hai
                </p>
              )}
            </div>
          )}

          {mode === "UPI" && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              {settings?.upiQrImage ? (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <SafeImage
                      src={settings.upiQrImage}
                      alt="UPI QR"
                      className="h-40 w-40 object-contain rounded-lg border border-border bg-white p-1"
                      placeholderClassName="flex h-40 w-40 items-center justify-center rounded-lg border border-border bg-white p-1"
                      placeholder={<QrCode className="size-20 text-muted-foreground/40" />}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Customer scan karein aur pay karein
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-dashed border-border pt-2">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold">{formatINR(total)}</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                    <QrCode className="size-6" />
                  </div>
                  <p className="text-sm font-medium">
                    Settings me UPI QR upload karein
                  </p>
                  <p className="text-xs text-muted-foreground">
                    UPI QR image upload ke baad yahan dikhega
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === "CREDIT" && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              {!hasCustomer ? (
                <div className="flex flex-col items-center gap-1 py-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                    <AlertCircle className="size-5" />
                  </div>
                  <p className="text-sm font-medium">
                    Credit ke liye customer chunein
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Walk-in customer pe credit nahi de sakte
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{formatINR(total)}</span>
                  </div>
                  <div>
                    <Label className="text-xs">Paid now (optional)</Label>
                    <div className="relative mt-1">
                      <IndianRupee className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={creditPaid}
                        onChange={(e) => setCreditPaid(e.target.value)}
                        placeholder="0"
                        className="h-11 pl-10 rounded-xl text-base font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-dashed border-border pt-2">
                    <span className="text-muted-foreground">Remaining</span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatINR(Math.max(0, total - creditPaidNum))}
                    </span>
                  </div>
                  <div>
                    <Label className="text-xs inline-flex items-center gap-1">
                      <Calendar className="size-3" /> Due Date
                    </Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-11 rounded-xl text-base mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Reason / Note (optional)</Label>
                    <Input
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      placeholder="Udhaar ki wajah..."
                      className="h-11 rounded-xl text-base mt-1"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {mode === "SPLIT" && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              {!hasCustomer ? (
                <div className="flex flex-col items-center gap-1 py-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                    <AlertCircle className="size-5" />
                  </div>
                  <p className="text-sm font-medium">
                    Split credit ke liye customer chunein
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Walk-in customer pe credit portion nahi de sakte
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold">{formatINR(total)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs inline-flex items-center gap-1">
                        <Banknote className="size-3" /> Cash
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        placeholder="0"
                        className="h-10 rounded-lg text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs inline-flex items-center gap-1">
                        <QrCode className="size-3" /> UPI
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={splitUpi}
                        onChange={(e) => setSplitUpi(e.target.value)}
                        placeholder="0"
                        className="h-10 rounded-lg text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs inline-flex items-center gap-1">
                        <HandCoins className="size-3" /> Credit
                      </Label>
                      <Input
                        type="number"
                        readOnly
                        value={splitCredit}
                        className="h-10 rounded-lg text-sm mt-1 bg-muted font-bold text-red-600 dark:text-red-400"
                      />
                    </div>
                  </div>
                  {splitCredit > 0 && (
                    <div>
                      <Label className="text-xs inline-flex items-center gap-1">
                        <Calendar className="size-3" /> Due Date
                      </Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-11 rounded-xl text-base mt-1"
                      />
                    </div>
                  )}
                  {splitOver && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3.5" />
                      Cash + UPI total se zyada hai
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Confirm */}
        <Button
          onClick={handleConfirm}
          disabled={isPending || !canConfirm}
          className="h-12 w-full rounded-xl bg-primary text-primary-foreground shadow-glow text-base"
        >
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5" />
              Confirm & Print Bill
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ---- Bill Print Dialog (PDF Receipt Engine) ----
function BillDialog({
  sale,
  settings,
  onOpenChange,
  onNewSale,
}: {
  sale: Sale | null;
  settings: Settings | undefined;
  onOpenChange: (v: boolean) => void;
  onNewSale: () => void;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const { mutate: fetchReceiptMsg, isPending: aiLoading } = useReceiptMessage();
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  // Independent loading flags for each action button
  const [printing, setPrinting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);

  const size = parseReceiptSize(settings?.receiptSize);
  // Fixed pixel width matching the receipt size — used by the PDF engine
  const containerWidth = size === "58" ? 220 : size === "80" ? 300 : 600;

  // Fetch AI personalized message whenever a new sale is shown
  useEffect(() => {
    if (!sale) {
      setAiMessage(null);
      return;
    }
    setAiMessage(null);
    fetchReceiptMsg(sale.id, {
      onSuccess: (data) => setAiMessage(data.message),
      onError: () => setAiMessage(null),
    });
  }, [sale?.id, fetchReceiptMsg]);

  if (!sale) return null;

  const safeSettings: Settings = settings || DEFAULT_SETTINGS;
  const filenameBase = `bill-${safeFilename(sale.invoiceNo)}`;
  const customerPhone = sale.customer?.phone || "";

  // ---- Action: Print (generate PDF → print via hidden iframe) ----
  const handlePrint = async () => {
    if (!receiptRef.current) return;
    setPrinting(true);
    try {
      const { blob } = await generatePDF(receiptRef.current, size);
      await printBlob(blob);
      toast.success("Print dialog khul raha hai — printer chunein");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Print nahi hua";
      toast.error(msg);
    } finally {
      setPrinting(false);
    }
  };

  // ---- Action: PDF Download ----
  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;
    setDownloadingPdf(true);
    try {
      const { blob } = await generatePDF(receiptRef.current, size);
      downloadBlob(blob, `${filenameBase}.pdf`);
      toast.success("PDF download ho raha hai");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "PDF nahi bani";
      toast.error(msg);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ---- Action: PNG Image Download ----
  const handleDownloadPNG = async () => {
    if (!receiptRef.current) return;
    setDownloadingPng(true);
    try {
      const { blob } = await generatePNG(receiptRef.current, size);
      downloadBlob(blob, `${filenameBase}.png`);
      toast.success("Image download ho raha hai");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Image nahi bani";
      toast.error(msg);
    } finally {
      setDownloadingPng(false);
    }
  };

  // ---- Action: WhatsApp Share (download PNG + open wa.me) ----
  const handleWhatsApp = async () => {
    if (!receiptRef.current) return;
    if (!customerPhone || !normalizePhone(customerPhone)) {
      toast.error("Customer ka phone nahi hai");
      return;
    }
    setSharingWhatsApp(true);
    try {
      const { blob: pngBlob } = await generatePNG(receiptRef.current, size);
      const message = buildBillMessage(
        {
          name: sale.customer?.name || "Customer",
          shop: safeSettings.shopName || "Bike Parts Shop",
          amount: sale.total,
          invoiceNo: sale.invoiceNo,
        },
        safeSettings.billTemplate || undefined
      );
      openWhatsAppWithReceipt(
        customerPhone,
        message,
        pngBlob,
        `${filenameBase}.png`
      );
      toast.info(
        "Image download ho raha hai. WhatsApp khulne ke baad image attach karke Send dabayein"
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "WhatsApp share nahi hua";
      toast.error(msg);
    } finally {
      setSharingWhatsApp(false);
    }
  };

  return (
    <Dialog open={!!sale} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[92vh] overflow-y-auto scroll-thin"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Bill Generated
          </DialogTitle>
          <DialogDescription>
            Invoice{" "}
            <span className="font-mono font-bold text-foreground">
              {sale.invoiceNo}
            </span>{" "}
            · {formatBillDate(sale.createdAt)}
          </DialogDescription>
        </DialogHeader>

        {/* AI message status */}
        {aiLoading && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Loader2 className="size-3.5 animate-spin" />
            AI personalized message ban raha hai...
          </div>
        )}

        {/* Receipt preview — this same div is the snapshot source for PDF/PNG */}
        <div className="rounded-xl border border-border bg-muted/40 p-2 sm:p-4 max-h-[60vh] overflow-y-auto scroll-thin flex justify-center">
          <div
            ref={receiptRef}
            style={{ width: containerWidth, background: "#ffffff" }}
          >
            <BillReceipt
              sale={sale}
              settings={safeSettings}
              size={size}
              aiMessage={aiMessage}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button
            onClick={handlePrint}
            disabled={printing}
            className="h-11 rounded-xl gap-1.5 text-xs sm:text-sm"
            size="sm"
          >
            {printing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            Print करें
          </Button>
          <Button
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
            variant="outline"
            className="h-11 rounded-xl gap-1.5 text-xs sm:text-sm"
            size="sm"
          >
            {downloadingPdf ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            PDF Download
          </Button>
          <Button
            onClick={handleDownloadPNG}
            disabled={downloadingPng}
            variant="outline"
            className="h-11 rounded-xl gap-1.5 text-xs sm:text-sm"
            size="sm"
          >
            {downloadingPng ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            Image (PNG)
          </Button>
          <Button
            onClick={handleWhatsApp}
            disabled={sharingWhatsApp}
            variant="outline"
            className="h-11 rounded-xl gap-1.5 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
            size="sm"
          >
            {sharingWhatsApp ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            WhatsApp Share
          </Button>
        </div>

        {/* New Sale button */}
        <Button
          onClick={onNewSale}
          className="h-12 w-full rounded-xl bg-primary text-primary-foreground shadow-soft text-base"
        >
          <Plus className="size-5" />
          नया बिल
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main SalesView ----
// Match an AI-recognized product against EXISTING inventory.
// Returns 0, 1 or many products so the UI can auto-add or show choices.
// AI must NEVER invent a new product during billing — it only finds real
// stock the owner already added.
function matchInventory(rec: any, products: Product[]): Product[] {
  const name = (rec?.name || "").toLowerCase().trim();
  const brand = (rec?.brand || "").toLowerCase().trim();
  const oem = (rec?.oemNumber || "").toLowerCase().trim();
  if (!name) return [];
  // 1. Exact OEM match (strongest signal)
  if (oem) {
    const exact = products.filter(
      (p) => (p.oemNumber || "").toLowerCase() === oem
    );
    if (exact.length) return exact;
  }
  // 2. Name contains / contained-by (handles "Brake Shoe Set" vs "Brake Shoe")
  const byName = products.filter((p) => {
    const pn = p.name.toLowerCase();
    return pn.includes(name) || name.includes(pn);
  });
  if (brand) {
    const withBrand = byName.filter((p) =>
      (p.brand || "").toLowerCase().includes(brand)
    );
    if (withBrand.length) return withBrand;
  }
  return byName;
}

export function SalesView() {
  const { data: prodData, isLoading: prodLoading } = useAllProducts();
  const { data: custData, isLoading: custLoading } = useCustomers();
  const { data: salesData, isLoading: salesLoading } = useSales(30, 10);
  const { data: settingsData } = useSettings();
  const createCustomer = useCreateCustomer();
  const createSale = useCreateSale();
  const { go } = useUI();

  const products = prodData?.products || [];
  const customers = custData?.customers || [];
  const recentSales = salesData?.sales || [];
  const settings = settingsData?.settings;

  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [lastSale, setLastSale] = useState<string | null>(null);
  // Active index for keyboard navigation in the product search dropdown.
  // -1 = none selected; 0..n = highlighted item. ArrowDown/ArrowUp move it,
  // Enter adds the highlighted item to cart, Escape clears the query.
  const [activeIdx, setActiveIdx] = useState(-1);

  // ---- Barcode + AI scanning state ----
  const recognize = useRecognizeProduct();
  const [scanOpen, setScanOpen] = useState(false);
  const [aiRecognizing, setAiRecognizing] = useState(false);
  const [aiMatches, setAiMatches] = useState<Product[] | null>(null);
  const aiPhotoRef = useRef<HTMLInputElement>(null);

  // Payment + Bill state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billSale, setBillSale] = useState<Sale | null>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const hasCustomer = customerId !== "walk-in" && !!selectedCustomer;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 6);
    return products
      .filter((p) =>
        [p.name, p.oemNumber, p.brand, p.bikeModels]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 10);
  }, [products, query]);

  // Clamp the keyboard-highlight index to the current result set so it never
  // points past the end. We reset it to 0 (top item) directly in the input's
  // onChange handler whenever the user types — no useEffect needed (avoids
  // the cascading-render lint warning). -1 means "nothing highlighted"
  // (only happens when the list is empty).
  const safeActiveIdx =
    filtered.length === 0
      ? -1
      : Math.max(0, Math.min(activeIdx, filtered.length - 1));

  // Keyboard navigation for the product search dropdown:
  //   ArrowDown  → move highlight down (wrap to top)
  //   ArrowUp    → move highlight up (wrap to bottom)
  //   Enter      → add highlighted item to cart
  //   Escape     → clear query + close dropdown
  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIdx((i) => ((i + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setActiveIdx((i) => ((i - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[safeActiveIdx];
      if (p) addToCart(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setActiveIdx(-1);
    }
  };

  const addToCart = (p: Product) => {
    if (p.quantity <= 0) {
      toast.error(`${p.name} — out of stock hai`);
      return;
    }
    setCart((prev) => {
      const found = prev.find((i) => i.product.id === p.id);
      if (found) {
        return prev.map((i) =>
          i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product: p, qty: 1 }];
    });
    setQuery("");
    setActiveIdx(-1);
  };

  // ---- Barcode scan: find product by code, add to cart ----
  // Tries exact barcode → exact OEM → OEM partial. If nothing matches,
  // drops the code into the search box so the owner can pick manually.
  const findProductByCode = (code: string): Product | null => {
    const c = code.trim().toLowerCase();
    if (!c) return null;
    let p = products.find((x) => (x.barcode || "").toLowerCase() === c);
    if (p) return p;
    p = products.find((x) => (x.oemNumber || "").toLowerCase() === c);
    if (p) return p;
    p = products.find(
      (x) =>
        !!x.oemNumber &&
        (x.oemNumber.toLowerCase().includes(c) ||
          c.includes(x.oemNumber.toLowerCase()))
    );
    return p || null;
  };

  const handleBarcodeDetected = (code: string) => {
    const p = findProductByCode(code);
    if (p) {
      // Stock-overflow guard: if this product is already in the cart at
      // its full stock quantity, don't increment again. The owner can still
      // scan other products; this just prevents selling more than stock.
      const existing = cart.find((i) => i.product.id === p.id);
      if (existing && existing.qty >= p.quantity) {
        toast.error(
          `Sirf ${p.quantity} pieces available hain`,
          { duration: 3500 }
        );
        return;
      }
      addToCart(p);
      toast.success(`${p.name} cart me add hua`);
    } else {
      toast.error(
        `Barcode "${code}" se koi product nahi mila. Search se add karein.`,
        { duration: 5000 }
      );
      setQuery(code);
    }
  };

  // ---- AI photo scan: recognize → match EXISTING inventory → add ----
  // AI must search existing inventory first. It must NOT invent a new
  // product during billing. Exact match → add. Multiple → chooser.
  // None → friendly message (no phantom product).
  const handleAiScanPhoto = async (file: File) => {
    if (aiRecognizing) return;
    setAiRecognizing(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      recognize.mutate(
        { image: dataUrl },
        {
          onSuccess: (resp: any) => {
            const rec = resp?.recognized;
            if (!rec || !rec.name) {
              toast.error(
                "AI se product identify nahi hua. Manual search use karein."
              );
              setAiRecognizing(false);
              return;
            }
            const matches = matchInventory(rec, products);
            if (matches.length === 1) {
              addToCart(matches[0]);
              toast.success(
                `${matches[0].name} cart me add hua (AI match) — Scan Next ke liye wapas AI Photo Scan dabayein`
              );
              setAiRecognizing(false);
            } else if (matches.length > 1) {
              setAiMatches(matches);
              setAiRecognizing(false);
            } else {
              toast.error(
                `AI ne "${rec.name}" pehchana par inventory me nahi hai. Pehle product add karein.`,
                { duration: 6000 }
              );
              setAiRecognizing(false);
            }
          },
          onError: () => {
            toast.error("AI scan fail hua. Manual search use karein.");
            setAiRecognizing(false);
          },
        }
      );
    } catch {
      toast.error("Photo padhne mein error");
      setAiRecognizing(false);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i
        )
        .filter((i) => i.qty > 0)
    );
  };

  const setQtyExact = (id: string, val: string) => {
    const n = Math.max(0, Number(val) || 0);
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === id ? { ...i, qty: n } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== id));
  };

  const subtotal = cart.reduce(
    (s, i) => s + i.product.sellingPrice * i.qty,
    0
  );
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalProfit = cart.reduce(
    (s, i) => s + (i.product.sellingPrice - i.product.purchasePrice) * i.qty,
    0
  );

  const submitAddCustomer = () => {
    if (!newName.trim()) {
      toast.error("Customer ka naam likhein");
      return;
    }
    createCustomer.mutate(
      {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        type: "mechanic",
      },
      {
        onSuccess: (d) => {
          setCustomerId(d.customer.id);
          setAddCustOpen(false);
          setNewName("");
          setNewPhone("");
        },
      }
    );
  };

  // Open payment dialog (replaces direct checkout)
  const openPayment = () => {
    if (cart.length === 0) {
      toast.error("Cart khali hai — pehle product add karein");
      return;
    }
    const overStock = cart.find((i) => i.qty > i.product.quantity);
    if (overStock) {
      toast.error(
        `${overStock.product.name}: sirf ${overStock.product.quantity} stock mein hai`
      );
      return;
    }
    setPaymentOpen(true);
  };

  // Confirm payment → create sale → open bill dialog
  const confirmPayment = (payload: {
    paymentMode: PaymentMode;
    paidAmount: number;
    discount: number;
    cashAmount: number;
    upiAmount: number;
    creditAmount: number;
    dueDate?: string;
    note?: string;
  }) => {
    const items = cart.map((i) => ({
      productId: i.product.id,
      quantity: i.qty,
      price: i.product.sellingPrice,
    }));
    createSale.mutate(
      {
        items,
        customerId: customerId === "walk-in" ? undefined : customerId,
        paymentMode: payload.paymentMode,
        paidAmount: payload.paidAmount,
        discount: payload.discount,
        cashAmount: payload.cashAmount,
        upiAmount: payload.upiAmount,
        creditAmount: payload.creditAmount,
        dueDate: payload.dueDate,
        note: payload.note,
      },
      {
        onSuccess: (d) => {
          setLastSale(d.sale.invoiceNo);
          setCart([]);
          setCustomerId("walk-in");
          setPaymentOpen(false);
          setBillSale(d.sale);
        },
        onError: (e: any) => {
          toast.error(e?.message || "Sale record nahi hui");
        },
      }
    );
  };

  const handleNewSale = () => {
    setBillSale(null);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24 lg:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go("dashboard")}
          className="md:hidden"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
            <ShoppingCart className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Sell Products
            </h1>
            <p className="text-sm text-muted-foreground">
              Bikri record karein · {settings?.shopName || "Bike Parts Shop"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        {/* LEFT: customer + product picker */}
        <div className="space-y-4 lg:col-span-3">
          {/* Customer selector */}
          <Card className="shadow-soft">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  Customer (Mechanic)
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 rounded-lg text-xs"
                  onClick={() => setAddCustOpen(true)}
                >
                  <UserPlus className="size-3.5" /> Add
                </Button>
              </div>
              {custLoading ? (
                <Skeleton className="h-12 rounded-xl" />
              ) : (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-12 w-full rounded-xl text-base">
                    <SelectValue placeholder="Customer chunein" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk-in">
                      <span className="inline-flex items-center gap-2">
                        <ShoppingBag className="size-4" /> Walk-in Customer
                      </span>
                    </SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="inline-flex items-center gap-2">
                          <User className="size-4" />
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ""}
                          {c.outstanding > 0 && (
                            <Badge
                              variant="secondary"
                              className="ml-1 text-[9px] bg-red-500/15 text-red-600 dark:text-red-400 px-1 py-0 h-3.5"
                            >
                              Udhaar {formatINR(c.outstanding)}
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasCustomer && selectedCustomer?.outstanding > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="size-3.5" />
                  Existing udhaar: {formatINR(selectedCustomer.outstanding)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Product picker */}
          <Card className="shadow-soft">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Product Search</Label>
                {filtered.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {query
                      ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`
                      : `${filtered.length} popular`}
                  </span>
                )}
              </div>
              {/* Scan buttons — barcode camera + AI photo.
                  These let the owner add products WITHOUT typing: scan a
                  barcode with the camera, or snap a photo and let AI find
                  the matching product already in inventory. */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => setScanOpen(true)}
                >
                  <ScanLine className="size-5" /> Scan Barcode
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => aiPhotoRef.current?.click()}
                  disabled={aiRecognizing}
                >
                  {aiRecognizing ? (
                    <>
                      <Loader2 className="size-5 animate-spin" /> AI soch raha…
                    </>
                  ) : (
                    <>
                      <Camera className="size-5" /> AI Photo Scan
                    </>
                  )}
                </Button>
              </div>
              {/* Multi-scan tip — only when cart has items, to reinforce
                  that scanning a product again bumps its quantity. */}
              {cart.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tip: Scan karte rahein — har product auto-add hoga. Same product dobara scan → quantity +1.
                </p>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    // Reset keyboard highlight to the top item whenever the
                    // user types — true autocomplete UX (top match selected).
                    setActiveIdx(0);
                  }}
                  onKeyDown={handleSearchKey}
                  className="h-12 pl-11 pr-10 rounded-xl text-base"
                  placeholder="Naam, OEM, brand se search karein..."
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveIdx(-1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {/* Keyboard hint — only show when there are results */}
              {filtered.length > 0 && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">↑↓</kbd>
                  navigate
                  <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">Enter</kbd>
                  add to cart
                </p>
              )}
              {prodLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {query
                    ? "Koi product nahi mila"
                    : "Search karein ya niche se chunein"}
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
                  {filtered.map((p, idx) => {
                    const inCart = cart.find((i) => i.product.id === p.id);
                    const isActive = idx === safeActiveIdx;
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                          isActive
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:bg-accent"
                        )}
                      >
                        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                          <SafeImage
                            src={getPrimaryPhoto(p.photo)}
                            alt={p.name}
                            className="size-full object-cover"
                            size="thumb"
                            placeholder={<Package className="size-5 text-muted-foreground" />}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {p.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.brand} · {p.oemNumber}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">
                            {formatINR(p.sellingPrice)}
                          </p>
                          <StockBadge
                            quantity={p.quantity}
                            minStock={p.minStock}
                            showLabel={false}
                            className="text-[10px]"
                          />
                        </div>
                        {inCart && (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                            {inCart.qty}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: cart */}
        <div className="lg:col-span-2 lg:sticky lg:top-4">
          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="size-4 text-primary" />
                Cart
                {totalItems > 0 && (
                  <Badge variant="secondary" className="rounded-full">
                    {totalItems}
                  </Badge>
                )}
              </CardTitle>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-destructive hover:text-destructive"
                  onClick={() => setCart([])}
                >
                  Clear
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 size-8 opacity-40" />
                  Cart khali hai
                  <p className="mt-1 text-xs">
                    Left side se product add karein
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto scroll-thin">
                  {cart.map((i) => {
                    const lineSubtotal = i.product.sellingPrice * i.qty;
                    const lineProfit =
                      (i.product.sellingPrice - i.product.purchasePrice) *
                      i.qty;
                    const overStock = i.qty > i.product.quantity;
                    return (
                      <div
                        key={i.product.id}
                        className="rounded-xl border border-border p-3 space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {i.product.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {i.product.brand} ·{" "}
                              {formatINR(i.product.sellingPrice)}/pc
                            </p>
                          </div>
                          <button
                            onClick={() => removeItem(i.product.id)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            aria-label="Remove"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="size-8 rounded-lg p-0"
                              onClick={() => updateQty(i.product.id, -1)}
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={i.qty}
                              onChange={(e) =>
                                setQtyExact(i.product.id, e.target.value)
                              }
                              className="h-8 w-14 rounded-lg text-center text-sm font-bold"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="size-8 rounded-lg p-0"
                              onClick={() => updateQty(i.product.id, 1)}
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">
                              {formatINR(lineSubtotal)}
                            </p>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                              <TrendingUp className="size-3" />+
                              {formatINR(lineProfit)}
                            </p>
                          </div>
                        </div>
                        {overStock && (
                          <p className="text-[11px] text-destructive flex items-center gap-1">
                            <X className="size-3" /> Stock mein sirf{" "}
                            {i.product.quantity} hai
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals */}
              {cart.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Items ({totalItems})
                    </span>
                    <span className="font-medium">{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <TrendingUp className="size-3.5 text-emerald-500" />
                      Est. Profit
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatINR(totalProfit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed border-border pt-2">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-xl font-bold tracking-tight">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  <Button
                    onClick={openPayment}
                    className="h-12 w-full rounded-xl bg-primary text-primary-foreground shadow-glow text-base"
                  >
                    <>
                      <IndianRupee className="size-5" />
                      Record Sale ({formatINR(subtotal)})
                    </>
                  </Button>
                </div>
              )}

              {lastSale && cart.length === 0 && !billSale && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-center">
                  <CheckCircle2 className="mx-auto mb-1 size-6 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Sale recorded!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Invoice: {lastSale}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent sales */}
      <Card className="shadow-soft">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-primary" />
            Recent Sales
          </CardTitle>
          <Badge variant="secondary" className="rounded-full text-xs">
            Last 10
          </Badge>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : recentSales.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Receipt className="mx-auto mb-2 size-8 opacity-40" />
              Abhi koi bikri nahi hui
              <p className="mt-1 text-xs">Pehli sale record karein</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {recentSales.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold font-mono">
                        {s.invoiceNo}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.customer?.name || "Walk-in Customer"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(s.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Package className="size-3.5" />
                      {s.itemCount} item{s.itemCount !== 1 ? "s" : ""}
                      {s.paymentMode && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-3.5 ml-1"
                        >
                          {s.paymentMode}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatINR(s.total)}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                        <TrendingUp className="size-3" />+
                        {formatINR(s.profit)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={addCustOpen} onOpenChange={setAddCustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Naya Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Naam</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-11 pl-10 rounded-xl"
                  placeholder="Mechanic ka naam"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Phone (optional)</Label>
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
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setAddCustOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground"
              onClick={submitAddCustomer}
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        subtotal={subtotal}
        settings={settings}
        hasCustomer={hasCustomer}
        customerName={
          hasCustomer
            ? selectedCustomer?.name || ""
            : "Walk-in Customer"
        }
        onConfirm={confirmPayment}
        isPending={createSale.isPending}
      />

      {/* Bill Print Dialog (PDF Receipt Engine) */}
      <BillDialog
        sale={billSale}
        settings={settings}
        onOpenChange={(v) => {
          if (!v) setBillSale(null);
        }}
        onNewSale={handleNewSale}
      />

      {/* ---- Barcode Camera Scanner (lazy-loaded; multiScan keeps the
           dialog open so the owner can scan product after product, then
           tap Done) ---- */}
      {scanOpen && (
        <BarcodeScanner
          open={scanOpen}
          onOpenChange={setScanOpen}
          onDetected={handleBarcodeDetected}
          multiScan
        />
      )}

      {/* ---- Hidden AI photo input (camera capture on mobile) ---- */}
      <input
        ref={aiPhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAiScanPhoto(f);
          e.target.value = "";
        }}
      />

      {/* ---- AI scan: multiple inventory matches chooser ---- */}
      <Dialog open={!!aiMatches} onOpenChange={(v) => !v && setAiMatches(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> AI se multiple match mile
            </DialogTitle>
            <DialogDescription>
              Kaun sa product cart me add karein?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto scroll-thin">
            {aiMatches?.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  addToCart(p);
                  toast.success(`${p.name} cart me add hua`);
                  setAiMatches(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  <SafeImage
                    src={getPrimaryPhoto(p.photo)}
                    alt={p.name}
                    className="size-full object-cover"
                    size="thumb"
                    placeholder={<Package className="size-5 text-muted-foreground" />}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.brand} · {p.oemNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">
                    {formatINR(p.sellingPrice)}
                  </p>
                  <StockBadge
                    quantity={p.quantity}
                    minStock={p.minStock}
                    showLabel={false}
                    className="text-[10px]"
                  />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Sticky mobile cart bar (visible only on small screens).
           The desktop cart lives in the right column; on mobile it scrolls
           away, so this fixed bar keeps the totals + Record Sale action
           always one tap away. Tapping it (or its button) opens payment —
           same openPayment() the desktop cart uses; no duplicate logic. */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3">
            <button
              type="button"
              onClick={openPayment}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={`Open payment — ${totalItems} items, ${formatINR(subtotal)}`}
            >
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
                <ShoppingCart className="size-5" />
                <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                  {totalItems}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">
                  {totalItems} item{totalItems !== 1 ? "s" : ""}
                </span>
                <span className="block truncate text-sm font-bold">
                  {formatINR(subtotal)}
                </span>
              </span>
            </button>
            <Button
              onClick={openPayment}
              className="h-11 shrink-0 rounded-xl bg-primary px-4 text-primary-foreground shadow-glow"
            >
              Record Sale
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
