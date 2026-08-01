"use client";

// =====================================================================
// RECEIPT ENGINE
// ---------------------------------------------------------------------
// Converts a DOM element (the rendered receipt HTML) into:
//   1. PNG  (via html2canvas → canvas.toDataURL)
//   2. PDF  (via jsPDF, receipt-size aware: 58mm / 80mm / A4)
//
// Flow:
//   Receipt HTML (hidden div)
//     → html2canvas → Canvas
//       → PNG dataURL / Blob
//       → jsPDF.addImage → PDF Blob
//         → Print (hidden iframe) / Download / WhatsApp Share
//
// One receipt design → identical PNG + PDF + Print output everywhere.
// =====================================================================

// ---- Lazy imports (these are client-only, heavy libs) ----
// IMPORTANT: We use `html2canvas-pro` (not the original `html2canvas`).
// The original library (last updated 2022) cannot parse modern CSS color
// functions like `oklch()` and `lab()` that Tailwind CSS 4 uses by default
// in its design-token variables. This caused the error:
//   "Attempting to parse an unsupported color function 'lab'"
// `html2canvas-pro` is a maintained fork that supports oklch/lab/color-mix.
async function getHtml2Canvas() {
  const mod = await import("html2canvas-pro");
  return mod.default || mod;
}

async function getJsPDF() {
  const mod = await import("jspdf");
  return mod.jsPDF || mod.default || mod;
}

// ---- Receipt size config ----
export type ReceiptSize = "58" | "80" | "A4";

export const RECEIPT_DIMENSIONS: Record<
  ReceiptSize,
  { widthPx: number; widthMm: number; scale: number }
> = {
  // 58mm thermal: ~220px @ 96dpi, render at 2x for crispness
  "58": { widthPx: 220, widthMm: 58, scale: 3 },
  // 80mm thermal: ~302px @ 96dpi, render at 2x
  "80": { widthPx: 300, widthMm: 80, scale: 3 },
  // A4: 210mm wide, render at ~600px, scale 2
  A4: { widthPx: 600, widthMm: 210, scale: 2 },
};

export function parseReceiptSize(s: string | null | undefined): ReceiptSize {
  if (s === "80") return "80";
  if (s === "A4") return "A4";
  return "58"; // default + most common for thermal printers
}

// =====================================================================
// CORE: render a DOM element to canvas via html2canvas
// =====================================================================
export async function renderToCanvas(
  element: HTMLElement,
  size: ReceiptSize
): Promise<HTMLCanvasElement> {
  const html2canvas = await getHtml2Canvas();
  const dims = RECEIPT_DIMENSIONS[size];

  // Clone the element and force the target width so the snapshot is
  // independent of the on-screen layout (which may be in a dialog / hidden).
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${dims.widthPx}px`;
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.margin = "0";
  clone.style.padding = "0";
  clone.style.background = "#ffffff";
  clone.style.transform = "none";
  clone.style.boxShadow = "none";
  clone.style.border = "none";

  // Wrap in an off-screen container so html2canvas can measure it
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = `${dims.widthPx}px`;
  wrapper.style.background = "#ffffff";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(clone, {
      scale: dims.scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: dims.widthPx,
      windowWidth: dims.widthPx,
      // onclone: ensure the cloned document renders in a clean light-mode
      // context with no inherited oklch/lab CSS variables from Tailwind 4.
      // `html2canvas-pro` already supports modern color functions, so this
      // is a belt-and-suspenders cleanup to avoid any edge cases.
      onclone: (doc) => {
        try {
          const root = doc.documentElement;
          // Force light color-scheme so `color-mix` / system colors resolve
          // to light values, not dark-mode ones.
          root.style.colorScheme = "light";
          // Drop any inline CSS custom-property declarations from <html>
          // (Tailwind 4 sets --color-*: oklch(...) here).
          const rootStyle = root.getAttribute("style") || "";
          if (rootStyle.includes("--")) {
            root.setAttribute(
              "style",
              rootStyle.replace(/--[\w-]+\s*:[^;]+;?/g, "").trim()
            );
          }
          // Remove theme classes from <html> and <body> so dark-mode
          // Tailwind utilities don't apply to the snapshot.
          root.classList.remove("dark");
          doc.body.classList.remove("dark");
        } catch {
          // non-fatal — html2canvas-pro handles colors correctly anyway
        }
      },
    });
    return canvas;
  } finally {
    document.body.removeChild(wrapper);
  }
}

// =====================================================================
// CANVAS → PNG
// =====================================================================
export async function generatePNG(
  element: HTMLElement,
  size: ReceiptSize
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const canvas = await renderToCanvas(element, size);
  const dataUrl = canvas.toDataURL("image/png");
  const blob = await dataUrlToBlob(dataUrl);
  return { dataUrl, blob, width: canvas.width, height: canvas.height };
}

// =====================================================================
// CANVAS → PDF (receipt-size aware)
// =====================================================================
export async function generatePDF(
  element: HTMLElement,
  size: ReceiptSize
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const canvas = await renderToCanvas(element, size);
  const dims = RECEIPT_DIMENSIONS[size];

  // Calculate image height in mm based on canvas aspect ratio
  const aspectRatio = canvas.height / canvas.width;
  const imgWidthMm = dims.widthMm;
  const imgHeightMm = imgWidthMm * aspectRatio;

  const jsPDF = await getJsPDF();
  // For thermal sizes, create a custom page size exactly matching the receipt
  // For A4, use standard A4 but the image still occupies full width
  const pdf =
    size === "A4"
      ? new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      : new jsPDF({
          unit: "mm",
          format: [imgWidthMm, Math.max(imgHeightMm, 10)],
          orientation: "portrait",
        });

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, imgWidthMm, imgHeightMm, undefined, "FAST");

  const blob = pdf.output("blob");
  const dataUrl = pdf.output("dataurlstring");
  return { blob, dataUrl, width: canvas.width, height: canvas.height };
}

// =====================================================================
// HELPERS
// =====================================================================
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay so the download can start
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// =====================================================================
// PRINT — open PDF blob in hidden iframe and trigger print dialog
// This avoids the broken browser HTML print scaling issues.
// =====================================================================
let _printIframe: HTMLIFrameElement | null = null;

export function printBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);

    // Remove any previous print iframe
    if (_printIframe) {
      document.body.removeChild(_printIframe);
      _printIframe = null;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    iframe.src = url;

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Resolve immediately; print dialog is now open
        resolve();
        // Clean up after a delay (give the print dialog time)
        setTimeout(() => {
          if (_printIframe === iframe) {
            document.body.removeChild(iframe);
            _printIframe = null;
            URL.revokeObjectURL(url);
          }
        }, 60000);
      } catch (e) {
        reject(e);
      }
    };

    iframe.onerror = (e) => reject(e);

    document.body.appendChild(iframe);
    _printIframe = iframe;
  });
}

// =====================================================================
// WHATSAPP SHARE FLOW
// ---------------------------------------------------------------------
// wa.me links can ONLY carry text — no file attachments from browser.
// So our flow is:
//   1. Auto-download the receipt PNG (so it's in the user's Downloads)
//   2. Open wa.me with the pre-filled text message
//   3. Toast: "PNG download ho raha hai. WhatsApp me PDF/PNG attach karke Send dabayein"
// =====================================================================
export function openWhatsAppWithReceipt(
  phone: string,
  message: string,
  receiptBlob: Blob,
  receiptFilename: string
): { openedChat: boolean; downloadedFile: boolean } {
  let openedChat = false;
  let downloadedFile = false;

  // 1. Download the receipt image so owner can attach it
  try {
    downloadBlob(receiptBlob, receiptFilename);
    downloadedFile = true;
  } catch {
    // download failure is non-fatal
  }

  // 2. Open WhatsApp chat with pre-filled text
  try {
    const cleanPhone = phone.replace(/[^\d]/g, "");
    // Indian numbers: if 10 digits, prefix 91
    const normalized =
      cleanPhone.length === 10
        ? "91" + cleanPhone
        : cleanPhone.replace(/^0+/, "");
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    openedChat = true;
  } catch {
    // WhatsApp open failure is non-fatal
  }

  return { openedChat, downloadedFile };
}

// =====================================================================
// ONE-SHOT: generate all receipt assets (PNG + PDF) from a DOM element
// Useful when you want both ready for the user.
// =====================================================================
export async function generateReceiptAssets(
  element: HTMLElement,
  size: ReceiptSize
): Promise<{
  png: { dataUrl: string; blob: Blob };
  pdf: { blob: Blob; dataUrl: string };
}> {
  const [png, pdf] = await Promise.all([
    generatePNG(element, size),
    generatePDF(element, size),
  ]);
  return {
    png: { dataUrl: png.dataUrl, blob: png.blob },
    pdf: { blob: pdf.blob, dataUrl: pdf.dataUrl },
  };
}

// =====================================================================
// QR CODE GENERATION (for UPI payment link or invoice info)
// =====================================================================
export async function generateQRCode(text: string): Promise<string> {
  // Dynamic import so the lib is only loaded on client
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 200,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// Build a UPI payment URI for the QR code
export function buildUPIURI(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}): string {
  const { upiId, payeeName, amount, note } = opts;
  const params = new URLSearchParams();
  params.set("pa", upiId);
  params.set("pn", payeeName);
  if (amount > 0) params.set("am", amount.toFixed(2));
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

// =====================================================================
// UTIL: safe filename for downloads
// =====================================================================
export function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}
