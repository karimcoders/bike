// WhatsApp link generator — uses wa.me (no API needed, owner taps Send manually)
// Rural Bihar approach: chat opens with pre-filled message, owner sends manually.

export type WhatsAppTemplate = "reminder" | "thankyou" | "bill";

export type WhatsAppContext = {
  name: string;
  shop: string;
  amount: number;
  date?: string;
  invoiceNo?: string;
};

function formatINR(n: number) {
  return (n || 0).toLocaleString("en-IN");
}

function applyTemplate(tpl: string, ctx: WhatsAppContext): string {
  return tpl
    .replace(/\{name\}/g, ctx.name || "Customer")
    .replace(/\{shop\}/g, ctx.shop || "Bike Parts Shop")
    .replace(/\{amount\}/g, formatINR(ctx.amount))
    .replace(/\{date\}/g, ctx.date || "")
    .replace(/\{invoiceNo\}/g, ctx.invoiceNo || "");
}

export const DEFAULT_TEMPLATES = {
  reminder:
    "Namaste {name} Ji,\n\nAapka {shop} ka ₹{amount} baki hai.\nDue Date: {date}\n\nKripya samay par payment kar dein.\n\nDhanyawad,\n{shop}",
  thankyou:
    "Namaste {name} Ji,\n\nAapka ₹{amount} payment receive ho gaya. Dhanyawad!\n\n{shop}",
  bill:
    "Namaste {name} Ji,\n\nAapki bill attach ki gayi hai. Invoice: {invoiceNo}\nTotal: ₹{amount}\n\nDhanyawad,\n{shop}",
};

/** Normalize an Indian phone number to international format without +. */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^\d]/g, "");
  // Remove leading 0 if present (e.g. 09876543210 -> 9876543210)
  if (p.startsWith("0")) p = p.slice(1);
  // If it doesn't start with country code, assume India (91)
  if (p.length === 10) p = "91" + p;
  if (p.length < 12) return null;
  return p;
}

/**
 * Build a wa.me URL that opens WhatsApp chat with a pre-filled message.
 * Owner still taps Send manually (no API, no cost, no approval needed).
 */
export function buildWhatsAppLink(
  phone: string,
  message: string
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/** Build a reminder message for a customer with outstanding balance. */
export function buildReminderMessage(
  ctx: WhatsAppContext,
  template: string = DEFAULT_TEMPLATES.reminder
): string {
  return applyTemplate(template, ctx);
}

export function buildThankYouMessage(
  ctx: WhatsAppContext,
  template: string = DEFAULT_TEMPLATES.thankyou
): string {
  return applyTemplate(template, ctx);
}

export function buildBillMessage(
  ctx: WhatsAppContext,
  template: string = DEFAULT_TEMPLATES.bill
): string {
  return applyTemplate(template, ctx);
}

/** Open WhatsApp chat in a new tab. Returns true if successful. */
export function openWhatsApp(phone: string, message: string): boolean {
  const link = buildWhatsAppLink(phone, message);
  if (!link) return false;
  window.open(link, "_blank", "noopener,noreferrer");
  return true;
}

/** Format a due date for display in messages (e.g. "20 August 2026"). */
export function formatDueDate(d: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
