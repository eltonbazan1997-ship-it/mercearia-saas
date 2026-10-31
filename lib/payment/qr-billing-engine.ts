import QRCode from "qrcode";
import type { Locale } from "@/lib/i18n/fiado-dictionary";

export interface PaymentQRCodePayloadInput {
  tenantId: string;
  customerId: string;
  amountCents: number;
  reference?: string | null;
  kind?: "fiado_settlement" | "fiado_full_settlement";
}

export interface FiadoStatementInput {
  storeName: string;
  customerName: string;
  debtCents: number;
  locale: Locale;
  currency?: string;
  entries: Array<{
    createdAt: string;
    type: "debit" | "payment" | "adjustment";
    amountCents: number;
    balanceAfterCents: number;
    notes: string | null;
  }>;
}

export function buildPaymentQRCodePayload(input: PaymentQRCodePayloadInput): string {
  const kind = input.kind ?? "fiado_settlement";
  const reference = input.reference ?? "manual";
  const params = new URLSearchParams({
    v: "1",
    op: kind,
    tenant: input.tenantId,
    customer: input.customerId,
    amount: String(input.amountCents),
    ref: reference,
  });
  return `mercearia://pagamento?${params.toString()}`;
}

export async function generatePaymentQRCodeDataUrl(
  payload: string,
  options?: { width?: number; margin?: number }
): Promise<string> {
  return QRCode.toDataURL(payload, {
    type: "image/png",
    width: options?.width ?? 1024,
    margin: options?.margin ?? 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

export function normalizeWhatsAppPhone(
  phoneNumber: string,
  locale: Locale
): string | null {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }
  if (locale === "pt-BR" && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

export function buildWhatsAppBillingLink(
  phoneNumber: string,
  message: string,
  locale: Locale = "pt-BR"
): string | null {
  const normalized = normalizeWhatsAppPhone(phoneNumber, locale);
  if (!normalized) {
    return null;
  }
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

function formatEntryLabel(type: FiadoStatementInput["entries"][number]["type"], locale: Locale): string {
  if (locale === "es-419") {
    if (type === "debit") return "Débito";
    if (type === "payment") return "Abono";
    return "Ajuste";
  }
  if (type === "debit") return "Débito";
  if (type === "payment") return "Abono";
  return "Ajuste";
}

function formatStatementCents(cents: number, locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function buildFiadoStatementMessage(input: FiadoStatementInput): string {
  const currency = input.currency ?? "BRL";
  const title =
    input.locale === "es-419" ? "ESTADO DE CUENTA" : "EXTRATO DE CUENTA CORRIENTE";
  const debtLabel = input.locale === "es-419" ? "Deuda actual" : "Dívida atual";
  const linesLabel = input.locale === "es-419" ? "Últimos movimientos" : "Últimos lançamentos";
  const greeting =
    input.locale === "es-419"
      ? `Hola ${input.customerName},`
      : `Olá ${input.customerName},`;
  const footer =
    input.locale === "es-419"
      ? `Total a liquidar: ${formatStatementCents(input.debtCents, input.locale, currency)}`
      : `Total em aberto: ${formatStatementCents(input.debtCents, input.locale, currency)}`;

  const lines: string[] = [
    "*-=-=-=-=-=-=-=-=-=-=-=-=-=*",
    `*${input.storeName}*`,
    "*=-=-=-=-=-=-=-=-=-=-=-=-=-*",
    greeting,
    "",
    `*${title}*`,
    `${linesLabel}:`,
  ];

  const recentEntries = input.entries.slice(0, 10);
  if (recentEntries.length === 0) {
    lines.push(
      input.locale === "es-419" ? "Sin movimientos recientes." : "Sem movimentações recentes."
    );
  } else {
    recentEntries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      const dateLabel = Number.isNaN(date.getTime())
        ? entry.createdAt.slice(0, 10)
        : date.toLocaleDateString(input.locale);
      const typeLabel = formatEntryLabel(entry.type, input.locale);
      lines.push(
        `${dateLabel}  ${typeLabel.padEnd(9, " ")}  ${formatStatementCents(
          entry.amountCents,
          input.locale,
          currency
        )}`
      );
      lines.push(
        `   ${input.locale === "es-419" ? "Saldo" : "Saldo"}: ${formatStatementCents(
          entry.balanceAfterCents,
          input.locale,
          currency
        )}`
      );
    });
  }

  lines.push("");
  lines.push(`*${debtLabel}: ${formatStatementCents(input.debtCents, input.locale, currency)}*`);
  lines.push(footer);
  lines.push(
    input.locale === "es-419"
      ? "Si ya pagó, responda a este mensaje con el comprobante."
      : "Se já pagou, responda esta mensagem com o comprovante."
  );

  return lines.join("\n");
}
