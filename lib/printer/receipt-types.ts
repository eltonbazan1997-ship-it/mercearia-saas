import type { Locale } from "@/lib/i18n/fiado-dictionary";

export type ReceiptWidth = "58mm" | "80mm";

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface FiadoReceiptData {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  currency: string;
  locale: Locale;
  width: ReceiptWidth;
  saleId: string;
  issuedAt: string;
  checksum: string;
  paymentMethod: "cash" | "credit";
  items: ReceiptLineItem[];
  subtotalCents: number;
  creditedCents: number;
  tenderedCents: number | null;
  changeCents: number | null;
  customerName: string | null;
  customerPhone: string | null;
  buyerName: string | null;
  debtBeforeCents: number | null;
  debtAfterCents: number | null;
  debtLimitCents: number | null;
  operatorName: string | null;
  qrCodeDataUrl: string | null;
  signatureRequired: boolean;
  footerNote: string | null;
}

const CHECKSUM_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateReceiptChecksum(seed: string): string {
  let hash = 2166136261;
  const source = `${seed}::mercearia-saas`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let remaining = hash;
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    const digit = remaining % CHECKSUM_ALPHABET.length;
    suffix += CHECKSUM_ALPHABET.charAt(digit);
    remaining = Math.floor(remaining / CHECKSUM_ALPHABET.length);
    remaining = (remaining * 1103515245 + 12345) >>> 0;
  }

  return `REC-${suffix}`;
}

export function formatReceiptCurrency(
  cents: number,
  locale: Locale,
  currency: string
): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatReceiptDateTime(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: undefined,
  }).format(parsed);
}

export function buildReceiptSignatureLine(customerName: string | null): string {
  const name = customerName?.trim() ? customerName.trim() : "________________________________";
  return name;
}
