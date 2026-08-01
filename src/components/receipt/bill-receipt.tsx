"use client";

// =====================================================================
// BILL RECEIPT COMPONENT
// ---------------------------------------------------------------------
// Professional thermal/A4 receipt that renders identically as:
//   - On-screen preview
//   - PNG (via html2canvas)
//   - PDF (via jsPDF)
//   - Print output
//
// Payment-mode aware:
//   CASH  → Total, Received, Return
//   UPI   → Mode, UPI ID, Paid
//   CREDIT→ Total, Paid, Remaining, Due Date (red CREDIT badge)
//   SPLIT → Cash + UPI + Credit breakdown
//
// Includes: shop logo, GST, QR code, AI personalized message, footer.
// =====================================================================

import { useEffect, useState } from "react";
import type { Sale, Settings, ReceiptSize } from "@/lib/types";
import { generateQRCode, buildUPIURI } from "@/lib/receipt";
import { normalizeSrc } from "@/components/ui/safe-image";
import { getFarewell } from "@/lib/greeting";

const Rs = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ---- Status badge ----
function StatusBadge({ status }: { status: Sale["status"] }) {
  const map = {
    PAID: { bg: "#16a34a", fg: "#ffffff", label: "PAID" },
    PARTIAL: { bg: "#ea580c", fg: "#ffffff", label: "PARTIAL" },
    PENDING: { bg: "#dc2626", fg: "#ffffff", label: "PENDING" },
  } as const;
  const s = map[status] || map.PENDING;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 4,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5,
      }}
    >
      {s.label}
    </span>
  );
}

// ---- Dashed separator ----
function Sep({ color = "#000" }: { color?: string }) {
  return (
    <div
      style={{
        borderTop: `1px dashed ${color}`,
        margin: "6px 0",
        opacity: 0.5,
      }}
    />
  );
}

export interface BillReceiptProps {
  sale: Sale;
  settings: Settings;
  size: ReceiptSize;
  aiMessage?: string | null;
  /** When true, shows a compact header (for embedded previews) */
  compact?: boolean;
}

export function BillReceipt({
  sale,
  settings,
  size,
  aiMessage,
  compact,
}: BillReceiptProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Determine QR content
  const isUPI = sale.paymentMode === "UPI" || sale.paymentMode === "SPLIT";
  const upiId = settings.upiId || "";
  const qrContent =
    isUPI && upiId
      ? buildUPIURI({
          upiId,
          payeeName: settings.shopName || "Shop",
          amount: sale.paidAmount || sale.total,
          note: sale.invoiceNo,
        })
      : `Invoice: ${sale.invoiceNo}\nAmount: Rs.${sale.total}\nDate: ${formatDate(
          sale.createdAt
        )}\nShop: ${settings.shopName || ""}`;

  useEffect(() => {
    let cancelled = false;
    generateQRCode(qrContent)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qrContent]);

  // ---- Font sizes based on receipt size ----
  const isSmall = size === "58";
  const isMedium = size === "80";
  const font = {
    title: isSmall ? 14 : isMedium ? 18 : 22,
    header: isSmall ? 10 : isMedium ? 12 : 14,
    body: isSmall ? 9 : isMedium ? 11 : 13,
    small: isSmall ? 8 : isMedium ? 9 : 11,
    mono: isSmall ? 9 : isMedium ? 10 : 12,
  };

  const remaining = Math.max(0, sale.total - sale.paidAmount);

  return (
    <div
      id="bill-receipt"
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000000",
        fontFamily:
          "'Menlo', 'Consolas', 'Courier New', monospace",
        padding: isSmall ? "8px 6px" : isMedium ? "10px 8px" : "16px 14px",
        boxSizing: "border-box",
        fontSize: font.body,
        lineHeight: 1.4,
      }}
    >
      {/* ===== SHOP HEADER ===== */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        {settings.logo && !compact && (
          <img
            src={normalizeSrc(settings.logo)}
            alt="logo"
            crossOrigin="anonymous"
            style={{
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
              maxWidth: isSmall ? 50 : 64,
              maxHeight: isSmall ? 50 : 64,
              objectFit: "contain",
              marginBottom: 4,
            }}
          />
        )}
        <div
          style={{
            fontSize: font.title,
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          {settings.shopName || "Bike Shop"}
        </div>
        {settings.ownerName && (
          <div style={{ fontSize: font.small }}>
            Prop: {settings.ownerName}
          </div>
        )}
        {settings.address && (
          <div style={{ fontSize: font.small }}>{settings.address}</div>
        )}
        {settings.phone && (
          <div style={{ fontSize: font.small }}>
            📞 {settings.phone}
          </div>
        )}
        {settings.gstNumber && (
          <div style={{ fontSize: font.small }}>
            GST: {settings.gstNumber}
          </div>
        )}
      </div>

      <Sep />

      {/* ===== INVOICE INFO ===== */}
      <div style={{ marginBottom: 2 }}>
        <Row label="Bill No" value={sale.invoiceNo} font={font} bold />
        <Row
          label="Date"
          value={`${formatDate(sale.createdAt)} ${formatTime(sale.createdAt)}`}
          font={font}
        />
        {sale.user?.name && (
          <Row label="Sold by" value={sale.user.name} font={font} />
        )}
      </div>

      <Sep />

      {/* ===== CUSTOMER INFO ===== */}
      {sale.customer && (
        <div style={{ marginBottom: 2 }}>
          <div style={{ fontWeight: 700, fontSize: font.body }}>
            Customer: {sale.customer.name}
          </div>
          {sale.customer.phone && (
            <div style={{ fontSize: font.small }}>
              📞 {sale.customer.phone}
            </div>
          )}
          {sale.customer.type && sale.customer.type !== "WALK_IN" && (
            <div style={{ fontSize: font.small }}>
              Type: {sale.customer.type}
            </div>
          )}
        </div>
      )}
      {!sale.customer && (
        <div style={{ marginBottom: 2, fontSize: font.small }}>
          Customer: Walk-in
        </div>
      )}

      <Sep />

      {/* ===== ITEMS TABLE ===== */}
      <div>
        {/* Header */}
        <div
          style={{
            display: "flex",
            fontWeight: 800,
            fontSize: font.small,
            borderBottom: "1px solid #000",
            paddingBottom: 2,
            marginBottom: 2,
          }}
        >
          <div style={{ flex: 1 }}>Item</div>
          <div style={{ width: 30, textAlign: "right" }}>Qty</div>
          <div style={{ width: 50, textAlign: "right" }}>Rate</div>
          <div style={{ width: 55, textAlign: "right" }}>Amt</div>
        </div>
        {/* Rows */}
        {sale.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontSize: font.body,
              padding: "1px 0",
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1, paddingRight: 4 }}>
              {item.name}
              {item.product?.location?.code && (
                <span style={{ fontSize: font.small, opacity: 0.6 }}>
                  {" "}
                  [{item.product.location.code}]
                </span>
              )}
            </div>
            <div style={{ width: 30, textAlign: "right" }}>
              {item.quantity}
            </div>
            <div style={{ width: 50, textAlign: "right" }}>
              {Rs(item.price)}
            </div>
            <div style={{ width: 55, textAlign: "right" }}>
              {Rs(item.subtotal)}
            </div>
          </div>
        ))}
      </div>

      <Sep />

      {/* ===== TOTALS ===== */}
      <div style={{ fontSize: font.body }}>
        <Row label="Subtotal" value={Rs(sale.subtotal)} font={font} />
        {sale.discount > 0 && (
          <Row
            label="Discount"
            value={"-" + Rs(sale.discount)}
            font={font}
            color="#dc2626"
          />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 800,
            fontSize: font.header,
            borderTop: "2px solid #000",
            borderBottom: "2px solid #000",
            padding: "3px 0",
            marginTop: 2,
          }}
        >
          <span>TOTAL</span>
          <span>{Rs(sale.total)}</span>
        </div>
      </div>

      <Sep />

      {/* ===== PAYMENT BREAKDOWN (mode-specific) ===== */}
      <div style={{ fontSize: font.body, marginBottom: 2 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 2,
          }}
        >
          <span style={{ fontWeight: 700 }}>Payment Mode</span>
          <StatusBadge status={sale.status} />
        </div>
        <Row
          label="Mode"
          value={sale.paymentMode}
          font={font}
          bold
        />

        {/* CASH */}
        {sale.paymentMode === "CASH" && (
          <>
            <Row label="Total Bill" value={Rs(sale.total)} font={font} />
            <Row
              label="Received"
              value={Rs(sale.cashAmount)}
              font={font}
              color="#16a34a"
            />
          </>
        )}

        {/* UPI */}
        {sale.paymentMode === "UPI" && (
          <>
            {settings.upiId && (
              <Row label="UPI ID" value={settings.upiId} font={font} />
            )}
            <Row
              label="Paid (UPI)"
              value={Rs(sale.upiAmount)}
              font={font}
              color="#16a34a"
              bold
            />
          </>
        )}

        {/* CREDIT / UDHAR */}
        {sale.paymentMode === "CREDIT" && (
          <>
            <Row label="Total Bill" value={Rs(sale.total)} font={font} />
            <Row
              label="Paid Now"
              value={Rs(sale.paidAmount)}
              font={font}
              color="#16a34a"
            />
            <Row
              label="Udhaar (Remaining)"
              value={Rs(remaining)}
              font={font}
              color="#dc2626"
              bold
            />
            {sale.dueDate && (
              <Row
                label="Due Date"
                value={formatDate(sale.dueDate)}
                font={font}
                color="#dc2626"
                bold
              />
            )}
          </>
        )}

        {/* SPLIT */}
        {sale.paymentMode === "SPLIT" && (
          <>
            <Row label="Total Bill" value={Rs(sale.total)} font={font} />
            {sale.cashAmount > 0 && (
              <Row
                label="  Cash"
                value={Rs(sale.cashAmount)}
                font={font}
              />
            )}
            {sale.upiAmount > 0 && (
              <Row
                label="  UPI"
                value={Rs(sale.upiAmount)}
                font={font}
              />
            )}
            {sale.creditAmount > 0 && (
              <Row
                label="  Udhaar"
                value={Rs(sale.creditAmount)}
                font={font}
                color="#dc2626"
              />
            )}
            <Row
              label="Total Paid"
              value={Rs(sale.paidAmount)}
              font={font}
              color="#16a34a"
              bold
            />
            {remaining > 0 && (
              <Row
                label="Remaining"
                value={Rs(remaining)}
                font={font}
                color="#dc2626"
                bold
              />
            )}
            {sale.dueDate && remaining > 0 && (
              <Row
                label="Due Date"
                value={formatDate(sale.dueDate)}
                font={font}
                color="#dc2626"
              />
            )}
          </>
        )}

        {/* Item count */}
        <Row
          label="Items"
          value={`${sale.itemCount} pcs`}
          font={font}
        />
      </div>

      {/* ===== QR CODE (for UPI payment or invoice info) ===== */}
      {qrDataUrl && (
        <div
          style={{
            textAlign: "center",
            margin: "6px 0 2px",
          }}
        >
          <img
            src={qrDataUrl}
            alt="QR"
            crossOrigin="anonymous"
            style={{
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
              width: isSmall ? 80 : 100,
              height: isSmall ? 80 : 100,
            }}
          />
          <div style={{ fontSize: font.small, opacity: 0.7 }}>
            {isUPI && upiId ? "Scan & Pay UPI" : "Scan for invoice info"}
          </div>
        </div>
      )}

      {/* ===== AI PERSONALIZED MESSAGE ===== */}
      {aiMessage && (
        <div
          style={{
            margin: "6px 0 2px",
            padding: "5px 6px",
            background: "#fef9c3",
            border: "1px dashed #ca8a04",
            borderRadius: 4,
            fontSize: font.small,
            color: "#713f12",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          {aiMessage}
        </div>
      )}

      <Sep />

      {/* ===== FOOTER ===== */}
      <div style={{ textAlign: "center", fontSize: font.small }}>
        {settings.billFooter && (
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            {settings.billFooter}
          </div>
        )}
        <div style={{ fontWeight: 700 }}>
          🙏 {getFarewell(settings.ownerName)}! Aapki service hamari zimmedari 🙏
        </div>
        <div style={{ marginTop: 2, opacity: 0.7 }}>
          {settings.shopName || "Bike Shop"} · {settings.phone || ""}
        </div>
        <div style={{ marginTop: 2, opacity: 0.5, fontSize: font.small - 1 }}>
          Computer Generated Bill · {sale.invoiceNo}
        </div>
      </div>
    </div>
  );
}

// ---- Helper: labeled row ----
function Row({
  label,
  value,
  font,
  bold,
  color,
}: {
  label: string;
  value: string;
  font: { body: number; small: number };
  bold?: boolean;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: font.body,
        fontWeight: bold ? 700 : 400,
        color: color || "#000",
        padding: "1px 0",
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Export a compact wrapper for statement-style documents
export function ReceiptWrapper({
  children,
  size,
}: {
  children: React.ReactNode;
  size: ReceiptSize;
}) {
  const isSmall = size === "58";
  const isMedium = size === "80";
  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        color: "#000",
        fontFamily: "'Menlo', 'Consolas', 'Courier New', monospace",
        padding: isSmall ? "8px 6px" : isMedium ? "10px 8px" : "16px 14px",
        boxSizing: "border-box",
        fontSize: isSmall ? 9 : isMedium ? 11 : 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export { Rs, formatDate, formatTime, Sep };
