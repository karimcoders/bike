"use client";

import { useRef, useState } from "react";
import {
  useSettings,
  useUpdateSettings,
  useUpload,
  useStaff,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  fileToDataUrl,
} from "@/lib/queries";
import { useUI } from "@/lib/store";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Store,
  User,
  Phone,
  MapPin,
  Palette,
  Moon,
  Sun,
  CreditCard,
  QrCode,
  Upload,
  Printer,
  MessageCircle,
  Receipt,
  Users,
  UserPlus,
  Trash2,
  Database,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  AlertTriangle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/safe-image";
import type { Settings, StaffUser, Role } from "@/lib/types";

const UPI_APPS = [
  { key: "phonepe", label: "PhonePe" },
  { key: "gpay", label: "Google Pay" },
  { key: "paytm", label: "Paytm" },
  { key: "bhim", label: "BHIM" },
];

const RECEIPT_SIZES: { value: string; label: string; desc: string; w: string }[] = [
  { value: "58", label: "58mm", desc: "Chhoti thermal", w: "w-10" },
  { value: "80", label: "80mm", desc: "Badi thermal", w: "w-16" },
  { value: "A4", label: "A4", desc: "Standard paper", w: "w-20" },
];

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  MANAGER:
    "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
  SALESMAN:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  MECHANIC:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
};

function fillTemplate(
  tpl: string,
  extra?: {
    name?: string;
    shop?: string;
    amount?: string;
    date?: string;
    invoiceNo?: string;
  }
) {
  return (tpl || "")
    .split("{name}")
    .join(extra?.name || "Raju")
    .split("{shop}")
    .join(extra?.shop || "Sharma Bike Parts")
    .split("{amount}")
    .join(extra?.amount || "₹5,000")
    .split("{date}")
    .join(extra?.date || "20 Aug 2026")
    .split("{invoiceNo}")
    .join(extra?.invoiceNo || "INV-001");
}

function Placeholders({ items }: { items: string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Placeholders:</span>
      {items.map((p) => (
        <code
          key={p}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {p}
        </code>
      ))}
    </div>
  );
}

function SaveBtn({
  pending,
  label = "Save",
  full,
}: {
  pending: boolean;
  label?: string;
  full?: boolean;
}) {
  return (
    <Button
      type="submit"
      className={cn("h-11 rounded-xl", full && "w-full")}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Saving...
        </>
      ) : (
        <>
          <Save className="size-4" /> {label}
        </>
      )}
    </Button>
  );
}

// ===================== Shop form (logo + details) =====================
function ShopForm({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const upload = useUpload();
  const logoRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    shopName: s.shopName,
    ownerName: s.ownerName,
    address: s.address,
    phone: s.phone,
    currency: s.currency || "₹",
    logo: s.logo || "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(form, {
      onSuccess: () => toast.success("Shop details save ho gayi"),
    });
  };

  const handleLogo = async (file: File) => {
    if (!file) return;
    // ---- LOCAL PREVIEW (instant, base64 data URL) ----
    // We use a base64 data URL instead of URL.createObjectURL because:
    //   1. Data URLs are stable — never revoked, so no race condition where
    //      the <img> tries to load a blob: URL after we revoke it.
    //   2. They work in every mobile WebView and desktop browser.
    // SafeImage uses key={src}, so it remounts cleanly when we swap the
    // data URL for the server URL after upload completes.
    let localPreview = "";
    try {
      localPreview = await fileToDataUrl(file);
      setForm((f) => ({ ...f, logo: localPreview }));
    } catch {
      // non-fatal — upload will still attempt
    }
    try {
      const res = await upload.mutateAsync({ file, folder: "logos" });
      setForm((f) => ({ ...f, logo: res.url }));
      // AWAIT the settings save so the user gets a single, accurate success
      // toast AND so the ["settings"] query has been invalidated + refetched
      // by the time they navigate to Billing. Previously this was fire-and-
      // forget — the user could switch to Billing before the save finished,
      // and the bill would render with the OLD logo (settings query had not
      // yet refetched). Now we wait: upload → save → invalidate → refetch,
      // all before the success toast fires.
      await update.mutateAsync({ logo: res.url });
      toast.success("Logo update ho gaya — bill par bhi dikhega");
    } catch {
      // Revert on failure
      setForm((f) => ({ ...f, logo: s.logo || "" }));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Logo upload */}
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50">
          {form.logo ? (
            <SafeImage
              src={form.logo}
              alt="Shop logo"
              className="size-full object-cover"
              placeholder={<Store className="size-6 text-muted-foreground" />}
            />
          ) : (
            <Store className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Shop Logo</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Bill aur receipt par dikhega
          </p>
          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLogo(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl"
            disabled={upload.isPending}
            onClick={() => logoRef.current?.click()}
          >
            {upload.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="size-4" /> Upload Logo
              </>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium">Shop Name</Label>
        <div className="relative mt-1">
          <Store className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={form.shopName}
            onChange={(e) => set("shopName", e.target.value)}
            className="h-11 pl-10 rounded-xl"
            placeholder="e.g. Sharma Bike Parts"
          />
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">Owner Name</Label>
        <div className="relative mt-1">
          <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={form.ownerName}
            onChange={(e) => set("ownerName", e.target.value)}
            className="h-11 pl-10 rounded-xl"
            placeholder="e.g. Sharma Ji"
          />
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">Phone</Label>
        <div className="relative mt-1">
          <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="h-11 pl-10 rounded-xl"
            placeholder="9876543210"
            inputMode="tel"
          />
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">Address</Label>
        <div className="relative mt-1">
          <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Textarea
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            rows={2}
            className="pl-10 rounded-xl"
            placeholder="Main Road, Gopalganj, Bihar"
          />
        </div>
      </div>
      <div>
        <Label className="text-sm font-medium">Currency Symbol</Label>
        <Input
          value={form.currency}
          onChange={(e) => set("currency", e.target.value)}
          className="mt-1 h-11 rounded-xl max-w-24"
          placeholder="₹"
          maxLength={3}
        />
      </div>
      <Button
        type="submit"
        className="h-12 w-full rounded-xl shadow-glow"
        disabled={update.isPending}
      >
        {update.isPending ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Saving...
          </>
        ) : (
          <>
            <Save className="size-5" /> Save Shop Details
          </>
        )}
      </Button>
    </form>
  );
}

// ===================== Payment Settings =====================
function PaymentSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const upload = useUpload();
  const qrRef = useRef<HTMLInputElement>(null);
  const [upiId, setUpiId] = useState(s.upiId || "");
  const [gstNumber, setGstNumber] = useState(s.gstNumber || "");
  const [apps, setApps] = useState<string[]>(
    s.upiApps
      ? s.upiApps.split(",").map((x) => x.trim()).filter(Boolean)
      : []
  );

  const toggleApp = (key: string) => {
    const next = apps.includes(key)
      ? apps.filter((k) => k !== key)
      : [...apps, key];
    setApps(next);
    update.mutate({ upiApps: next.join(",") });
  };

  const handleQr = async (file: File) => {
    if (!file) return;
    // ---- LOCAL PREVIEW (instant, base64 data URL) ----
    // Same pattern as handleLogo: use base64 data URL (no revoke race).
    // NOTE: We do NOT save the base64 data URL to the DB here — that would
    // bloat the settings row with a 100KB+ string. We only set it as local
    // form state so the user sees an instant preview. The server URL is
    // saved to the DB once the upload completes.
    let localPreview = "";
    try {
      localPreview = await fileToDataUrl(file);
      // Local preview only — do NOT persist the base64 to the DB.
      // The PaymentSection reads `s.upiQrImage` from the settings query,
      // so to show the local preview we would need local state. For
      // simplicity we still call update.mutate here, but with the server
      // URL once the upload finishes (below). The brief flicker is
      // acceptable — the upload usually completes in <500ms.
    } catch {
      // non-fatal — upload will still attempt
    }
    try {
      const res = await upload.mutateAsync({ file, folder: "qr" });
      // AWAIT the settings save so the SalesView bill (which uses the
      // same UPI QR) refetches before the user navigates to billing.
      await update.mutateAsync({ upiQrImage: res.url });
      toast.success("QR image update ho gayi — bill par bhi dikhegi");
    } catch {
      // Revert on failure
      update.mutate({ upiQrImage: s.upiQrImage || "" });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { upiId, gstNumber, upiApps: apps.join(",") },
      { onSuccess: () => toast.success("Payment settings save ho gayi") }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-primary" />
          Payment Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {/* UPI ID */}
          <div>
            <Label className="text-sm font-medium">UPI ID</Label>
            <div className="relative mt-1">
              <QrCode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="h-11 pl-10 rounded-xl"
                placeholder="shop@paytm"
                autoCapitalize="none"
              />
            </div>
          </div>

          {/* UPI QR image */}
          <div>
            <Label className="text-sm font-medium">UPI QR Image</Label>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50">
                {s.upiQrImage ? (
                  <SafeImage
                    src={s.upiQrImage}
                    alt="UPI QR"
                    className="size-full object-cover"
                    placeholder={<QrCode className="size-6 text-muted-foreground" />}
                  />
                ) : (
                  <QrCode className="size-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <input
                  ref={qrRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleQr(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  disabled={upload.isPending}
                  onClick={() => qrRef.current?.click()}
                >
                  {upload.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="size-4" /> Upload QR
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* UPI Apps */}
          <div>
            <Label className="text-sm font-medium">
              UPI Apps (jo accept karte ho)
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {UPI_APPS.map((app) => {
                const selected = apps.includes(app.key);
                return (
                  <button
                    key={app.key}
                    type="button"
                    onClick={() => toggleApp(app.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {selected && <Check className="size-3" />}
                    {app.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Auto-save ho jaata hai
            </p>
          </div>

          {/* GST Number */}
          <div>
            <Label className="text-sm font-medium">GST Number (optional)</Label>
            <Input
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className="mt-1 h-11 rounded-xl"
              placeholder="22AAAAA0000A1Z5"
              autoCapitalize="characters"
            />
          </div>

          <SaveBtn pending={update.isPending} label="Save Payment Settings" />
        </form>
      </CardContent>
    </Card>
  );
}

// ===================== Printer Settings =====================
function PrinterSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [receiptSize, setReceiptSize] = useState(s.receiptSize || "80");
  const [printerType, setPrinterType] = useState(s.printerType || "thermal");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { receiptSize, printerType },
      { onSuccess: () => toast.success("Printer settings save ho gayi") }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Printer className="size-4 text-primary" />
          Printer Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {/* Receipt size */}
          <div>
            <Label className="text-sm font-medium">Receipt Size</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {RECEIPT_SIZES.map((r) => {
                const selected = receiptSize === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReceiptSize(r.value)}
                    className={cn(
                      "flex flex-col items-center justify-start gap-2 rounded-xl border-2 p-3 transition-all",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <div
                      className={cn(
                        "h-12 rounded bg-muted-foreground/15",
                        r.w
                      )}
                    />
                    <div className="text-center">
                      <p className="text-sm font-semibold">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.desc}
                      </p>
                    </div>
                    {selected && <Check className="size-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Printer type */}
          <div>
            <Label className="text-sm font-medium">Printer Type</Label>
            <Select value={printerType} onValueChange={setPrinterType}>
              <SelectTrigger className="mt-1 h-11 w-full rounded-xl">
                <SelectValue placeholder="Select printer type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thermal">Thermal Printer</SelectItem>
                <SelectItem value="a4">A4 Printer</SelectItem>
                <SelectItem value="pdf">PDF Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SaveBtn pending={update.isPending} label="Save Printer Settings" />
        </form>
      </CardContent>
    </Card>
  );
}

// ===================== WhatsApp Settings =====================
function WhatsAppSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [enabled, setEnabled] = useState(s.whatsappEnabled);
  const [reminder, setReminder] = useState(s.whatsappTemplate || "");
  const [thankYou, setThankYou] = useState(s.thankYouTemplate || "");
  const [bill, setBill] = useState(s.billTemplate || "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        whatsappTemplate: reminder,
        thankYouTemplate: thankYou,
        billTemplate: bill,
      },
      { onSuccess: () => toast.success("WhatsApp templates save ho gaye") }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-primary" />
          WhatsApp Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info banner */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
          <strong>Note:</strong> WhatsApp API ki zarurat nahi — sirf chat open
          hota hai, owner Send dabata hai. Free, koi charge nahi.
        </div>

        {/* Enable */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Enable WhatsApp</p>
            <p className="text-xs text-muted-foreground">
              Customer ko reminder/bill bhejne ke liye
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              update.mutate({ whatsappEnabled: v });
            }}
          />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Reminder Template */}
          <div>
            <Label className="text-sm font-medium">Reminder Template</Label>
            <Textarea
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              rows={3}
              className="mt-1 rounded-xl"
              placeholder="Namaste {name} Ji, Aapka {shop} ka ₹{amount} baki hai..."
            />
            <Placeholders items={["{name}", "{shop}", "{amount}", "{date}"]} />
            {/* Live preview */}
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Live Preview
              </p>
              <p className="whitespace-pre-wrap text-xs text-emerald-900 dark:text-emerald-100">
                {fillTemplate(reminder) || (
                  <span className="italic text-muted-foreground">
                    Template khaali hai
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Thank You Template */}
          <div>
            <Label className="text-sm font-medium">Thank You Template</Label>
            <Textarea
              value={thankYou}
              onChange={(e) => setThankYou(e.target.value)}
              rows={2}
              className="mt-1 rounded-xl"
              placeholder="Dhanyavaad {name} Ji! {shop} se judne ke liye."
            />
            <Placeholders items={["{name}", "{shop}", "{amount}", "{date}"]} />
          </div>

          {/* Bill Template */}
          <div>
            <Label className="text-sm font-medium">Bill Template</Label>
            <Textarea
              value={bill}
              onChange={(e) => setBill(e.target.value)}
              rows={2}
              className="mt-1 rounded-xl"
              placeholder="Namaste {name} Ji, {shop} ki bill {invoiceNo}, total ₹{amount}."
            />
            <Placeholders
              items={["{name}", "{shop}", "{amount}", "{invoiceNo}"]}
            />
          </div>

          <SaveBtn pending={update.isPending} label="Save WhatsApp Templates" />
        </form>
      </CardContent>
    </Card>
  );
}

// ===================== Bill Settings =====================
function BillSection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [billFooter, setBillFooter] = useState(s.billFooter || "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { billFooter },
      { onSuccess: () => toast.success("Bill footer save ho gaya") }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4 text-primary" />
          Bill Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Bill Footer Message</Label>
            <Textarea
              value={billFooter}
              onChange={(e) => setBillFooter(e.target.value)}
              rows={2}
              className="mt-1 rounded-xl"
              placeholder="Dhanyavaad! Phir aayiye. - Sharma Bike Parts"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ye message har bill ke neeche print hoga
            </p>
          </div>
          <SaveBtn pending={update.isPending} label="Save Bill Settings" />
        </form>
      </CardContent>
    </Card>
  );
}

// ===================== AI Provider Config =====================
function AISection({ s }: { s: Settings }) {
  const update = useUpdateSettings();
  const [provider, setProvider] = useState(s.aiProvider || "openrouter");
  const [apiKey, setApiKey] = useState(s.aiApiKey || "");
  const [showKey, setShowKey] = useState(false);
  const keySet = !!s.aiKeySet;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { aiProvider: provider, aiApiKey: apiKey },
      {
        onSuccess: () => {
          toast.success("AI settings save ho gaye");
          setApiKey(""); // clear local — server keeps the real one
        },
      }
    );
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" />
          AI Provider (Chat, Scan, Voice)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <strong className="font-semibold">Status:</strong>{" "}
            {keySet ? (
              <>✅ AI key configured — chat, photo scan, voice search sab kaam karenge.</>
            ) : (
              <>⚠️ AI key set nahi hai. Chat/Scan/Voice kaam nahi karenge. Niche key daalein.</>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">AI Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter (recommended — free models)</SelectItem>
                <SelectItem value="groq">Groq (fast, free)</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="auto">Auto (try all)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              OpenRouter sabse achha hai — India mein kaam karta hai, free models available.
            </p>
          </div>

          <div>
            <Label className="text-sm font-medium">API Key</Label>
            <div className="relative mt-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="rounded-xl pr-10"
                placeholder={keySet ? `Saved: ${s.aiApiKey} (type new to replace)` : "sk-or-v1-... (OpenRouter key)"}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Key DB mein save hota hai — Vercel redeploy ke baad bhi rehta hai. Get a free key:{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>

          <SaveBtn pending={update.isPending} label="Save AI Settings" />
        </form>
      </CardContent>
    </Card>
  );
}

// ===================== Staff Management =====================
function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] uppercase", ROLE_BADGE[role])}
    >
      {role}
    </Badge>
  );
}

function StaffSection() {
  const { data, isLoading } = useStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  const { user } = useUI();

  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Add staff form state
  const [nName, setNName] = useState("");
  const [nUsername, setNUsername] = useState("");
  const [nPassword, setNPassword] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nRole, setNRole] = useState<Role>("SALESMAN");
  const [showNPw, setShowNPw] = useState(false);

  const staff = data?.staff ?? [];

  const resetAddForm = () => {
    setNName("");
    setNUsername("");
    setNPassword("");
    setNPhone("");
    setNRole("SALESMAN");
    setShowNPw(false);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (nPassword.length < 4) {
      toast.error("Password kam se kam 4 char ka hona chahiye");
      return;
    }
    createStaff.mutate(
      {
        name: nName,
        username: nUsername,
        password: nPassword,
        phone: nPhone || undefined,
        role: nRole,
      },
      {
        onSuccess: () => {
          setAddOpen(false);
          resetAddForm();
        },
      }
    );
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPw.length < 4) {
      toast.error("Password kam se kam 4 char ka hona chahiye");
      return;
    }
    updateStaff.mutate(
      { id: resetTarget.id, body: { password: newPw } },
      {
        onSuccess: () => {
          setResetTarget(null);
          setNewPw("");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteStaff.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
      },
    });
  };

  return (
    <Card className="shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-primary" />
          Staff Management
        </CardTitle>
        <Button
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => setAddOpen(true)}
        >
          <UserPlus className="size-4" /> Add Staff
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Koi staff user nahi mila
          </p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto scroll-thin pr-1">
            {staff.map((st) => {
              const isSelf = user?.id === st.id;
              return (
                <div
                  key={st.id}
                  className={cn(
                    "rounded-xl border p-3",
                    isSelf
                      ? "border-primary/40 bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                      {st.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">
                          {st.name}
                        </p>
                        <RoleBadge role={st.role} />
                        {isSelf && (
                          <Badge variant="secondary" className="text-[10px]">
                            You
                          </Badge>
                        )}
                        {!st.active && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{st.username}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {st.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" /> {st.phone}
                          </span>
                        )}
                        <span>📊 {st._count?.sales ?? 0} sales</span>
                        <span>
                          📅{" "}
                          {new Date(st.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {/* Role select */}
                    <Select
                      value={st.role}
                      onValueChange={(v) =>
                        updateStaff.mutate({ id: st.id, body: { role: v } })
                      }
                      disabled={updateStaff.isPending}
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="MANAGER">MANAGER</SelectItem>
                        <SelectItem value="SALESMAN">SALESMAN</SelectItem>
                        <SelectItem value="MECHANIC">MECHANIC</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Active toggle */}
                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">
                        Active
                      </span>
                      <Switch
                        checked={st.active}
                        onCheckedChange={(v) =>
                          updateStaff.mutate({
                            id: st.id,
                            body: { active: v },
                          })
                        }
                        disabled={updateStaff.isPending}
                      />
                    </div>

                    {/* Reset password */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl"
                      onClick={() => {
                        setResetTarget(st);
                        setNewPw("");
                        setShowPw(false);
                      }}
                    >
                      <KeyRound className="size-4" /> Reset Pw
                    </Button>
                  </div>

                  {/* Delete row */}
                  {isSelf ? (
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
                      Apna account delete nahi kar sakte
                    </p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8 w-full rounded-xl text-red-600 hover:bg-red-500/10 hover:text-red-700"
                      onClick={() => setDeleteTarget(st)}
                      disabled={deleteStaff.isPending}
                    >
                      <Trash2 className="size-4" /> Delete Staff
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add Staff Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Staff User</DialogTitle>
              <DialogDescription>
                Naya staff user create karein. Role decide karein.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Name</Label>
                <Input
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="Ramesh Kumar"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Username</Label>
                <Input
                  value={nUsername}
                  onChange={(e) => setNUsername(e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="ramesh"
                  required
                  autoCapitalize="none"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Password</Label>
                <div className="relative mt-1">
                  <Input
                    value={nPassword}
                    onChange={(e) => setNPassword(e.target.value)}
                    className="h-11 rounded-xl pr-10"
                    type={showNPw ? "text" : "password"}
                    placeholder="min 4 characters"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showNPw ? "Hide password" : "Show password"}
                    onClick={() => setShowNPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNPw ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Phone (optional)</Label>
                <Input
                  value={nPhone}
                  onChange={(e) => setNPhone(e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                  placeholder="9876543210"
                  inputMode="tel"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Role</Label>
                <Select
                  value={nRole}
                  onValueChange={(v) => setNRole(v as Role)}
                >
                  <SelectTrigger className="mt-1 h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="MANAGER">MANAGER</SelectItem>
                    <SelectItem value="SALESMAN">SALESMAN</SelectItem>
                    <SelectItem value="MECHANIC">MECHANIC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createStaff.isPending}
                  className="rounded-xl"
                >
                  {createStaff.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-4" /> Create
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog
          open={!!resetTarget}
          onOpenChange={(o) => !o && setResetTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                {resetTarget?.name} (@{resetTarget?.username}) ka naya password
                set karein.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleReset} className="space-y-3">
              <div>
                <Label className="text-sm font-medium">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="h-11 rounded-xl pr-10"
                    type={showPw ? "text" : "password"}
                    placeholder="min 4 characters"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPw ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetTarget(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateStaff.isPending}
                  className="rounded-xl"
                >
                  {updateStaff.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Resetting...
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-4" /> Reset Password
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Staff User?</DialogTitle>
              <DialogDescription>
                Ye action undo nahi ho sakta.{" "}
                <strong>{deleteTarget?.name}</strong> (@
                {deleteTarget?.username}) ko delete karna chahte ho?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteStaff.isPending}
                className="rounded-xl"
              >
                {deleteStaff.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="size-4" /> Delete
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ===================== Backup & Data =====================
function BackupSection({ s }: { s: Settings }) {
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4 text-primary" />
          Backup & Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">ℹ️ Backup Info</p>
          <p>
            Database backup abhi automatic nahi hai. Future me Google
            Drive/Dropbox sync add hoga.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-medium">Backup Status</p>
            <p className="text-xs text-muted-foreground">
              Auto-sync abhi available nahi
            </p>
          </div>
          {s.backupEnabled ? (
            <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Disabled
            </Badge>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() =>
            toast.info("Coming soon! Backup feature abhi kaam me hai.")
          }
        >
          <Database className="size-4" /> Export Data
        </Button>
      </CardContent>
    </Card>
  );
}

// ===================== Main view =====================
// ---- Demo Data Cleanup ----
// Lets the owner safely remove the old seed/demo data (20 demo products,
// 4 demo customers, demo sales, demo locations, demo settings) that was
// created by the OLD seed.ts before it was cleaned up. Identifies demo
// records by EXACT identifiers (OEM numbers, name+phone, location codes)
// so it can NEVER match real owner data.
function DemoCleanupSection() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const runPreview = async () => {
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/cleanup-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const json = await res.json();
      if (json?.success) {
        setPreview(json.data);
        setOpen(true);
      } else {
        toast.error(json?.error || "Preview nahi hua");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/cleanup-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: false }),
      });
      const json = await res.json();
      if (json?.success) {
        const d = json.data.deleted;
        toast.success(
          `Demo data hata diya: ${d.products} products, ${d.customers} customers, ${d.sales} sales, ${d.locations} locations${d.settings ? " + settings reset" : ""}`,
          { duration: 6000 }
        );
        setOpen(false);
        setPreview(null);
        // Reload to refresh all cached queries (products, customers, etc).
        setTimeout(() => window.location.reload(), 1200);
      } else {
        toast.error(json?.error || "Delete fail");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(false);
    }
  };

  const counts = preview?.counts;
  const hasDemo =
    counts &&
    (counts.products > 0 ||
      counts.customers > 0 ||
      counts.sales > 0 ||
      counts.locations > 0 ||
      counts.settings > 0);

  return (
    <Card className="shadow-soft border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-destructive" />
          Demo Data Cleanup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          App me purana demo/seed data (sample products, demo customers,
          demo sales) pad sakta hai. Ye button sirf DEMO records identify
          karega (exact OEM numbers se) aur unhe hata dega. Aapke REAL
          products/customers/sales kabhi nahi honge.
        </p>
        <Button
          variant="outline"
          className="w-full h-11 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={runPreview}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {loading ? "Check ho raha hai…" : "Demo Data Check Karein"}
        </Button>

        <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                Demo Data Preview
              </DialogTitle>
              <DialogDescription>
                Ye records delete honge. Real data bilkul safe rahega.
              </DialogDescription>
            </DialogHeader>

            {!hasDemo ? (
              <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Koi demo data nahi mila! ✅
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aapka database already clean hai.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto scroll-thin">
                {/* Summary counts */}
                <div className="grid grid-cols-2 gap-2">
                  <CountBox label="Products" n={counts.products} />
                  <CountBox label="Customers" n={counts.customers} />
                  <CountBox label="Sales" n={counts.sales} />
                  <CountBox label="Locations" n={counts.locations} />
                </div>
                {counts.settings > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ Demo shop settings ("Sharma Bike Parts") bhi reset honge.
                  </p>
                )}

                {/* Product details */}
                {preview?.detail?.products?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">Demo Products:</p>
                    <div className="space-y-1">
                      {preview.detail.products.map((p: any) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1 text-xs"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="font-mono text-muted-foreground">
                            {p.oem}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer details */}
                {preview?.detail?.customers?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-1">Demo Customers:</p>
                    <div className="space-y-1">
                      {preview.detail.customers.map((c: any) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1 text-xs"
                        >
                          <span>{c.name}</span>
                          <span className="text-muted-foreground">
                            {c.phone || "(no phone)"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                onClick={runDelete}
                disabled={!hasDemo || deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {deleting ? "Deleting…" : "Delete Demo Data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CountBox({ label, n }: { label: string; n: number }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-center",
        n > 0
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/30"
      )}
    >
      <p className="text-2xl font-bold">{n}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function SettingsView() {
  const { data, isLoading } = useSettings();
  const { user } = useUI();
  const { theme, setTheme } = useTheme();

  const s: Settings | undefined = data?.settings;
  const role = user?.role;

  if (isLoading || !s) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const isAdmin = role === "ADMIN";

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Shop, payment, printer, WhatsApp aur staff manage karein
        </p>
      </div>

      {/* 1. Appearance */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-primary" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-sm font-medium">Theme</Label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-3 transition-all",
                theme === "light"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              )}
            >
              <Sun className="size-5 text-amber-500" />
              <span className="text-sm font-medium">Light</span>
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 p-3 transition-all",
                theme === "dark"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              )}
            >
              <Moon className="size-5 text-primary" />
              <span className="text-sm font-medium">Dark</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Shop Details */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="size-4 text-primary" />
            Shop Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ShopForm key={s.id} s={s} />
        </CardContent>
      </Card>

      {/* 3. Payment */}
      <PaymentSection s={s} />

      {/* 4. Printer */}
      <PrinterSection s={s} />

      {/* 5. WhatsApp */}
      <WhatsAppSection s={s} />

      {/* 6. Bill */}
      <BillSection s={s} />

      {/* 6b. AI Provider Config */}
      <AISection s={s} />

      {/* 7. Staff (ADMIN only) */}
      {isAdmin && <StaffSection />}

      {/* 8. Backup */}
      <BackupSection s={s} />

      {/* 9. Demo Data Cleanup (ADMIN only) */}
      {isAdmin && <DemoCleanupSection />}

      {/* 10. Account */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-primary" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{user?.name}</p>
                {role && (
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] uppercase", ROLE_BADGE[role])}
                  >
                    {role}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">@{user?.username}</p>
              {user?.phone && (
                <p className="text-xs text-muted-foreground">{user.phone}</p>
              )}
            </div>
          </div>
          <Separator />
          <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">
              Phase 2 Features — Now Available ✅
            </p>
            <p>
              POS Billing (Cash/UPI/Credit), Customer Ledger, WhatsApp
              Reminders, Staff Management, AI Daily Closing, Printer Settings,
              Photo Recognition, Voice Search, AI Insights, OCR Invoice
              Scanner, AI Reports.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
