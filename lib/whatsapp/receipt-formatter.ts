import type { Locale } from "@/lib/i18n/fiado-dictionary";
import {
  formatReceiptCurrency,
  formatReceiptDateTime,
  type FiadoReceiptData,
} from "@/lib/printer/receipt-types";

const WHATSAPP_LINE_WIDTH = 32;

function repeat(character: string, length: number): string {
  return character.repeat(Math.max(length, 0));
}

function padRight(text: string, width: number): string {
  const visibleLength = text.length;
  if (visibleLength >= width) {
    return text.slice(0, width);
  }
  return text + repeat(" ", width - visibleLength);
}

function padLeft(text: string, width: number): string {
  const visibleLength = text.length;
  if (visibleLength >= width) {
    return text.slice(0, width);
  }
  return repeat(" ", width - visibleLength) + text;
}

function centerText(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  const totalPadding = width - text.length;
  const left = Math.floor(totalPadding / 2);
  return repeat(" ", left) + text;
}

function splitLabelValue(label: string, value: string, width: number): string {
  if (label.length + value.length + 1 <= width) {
    return padRight(label, width - value.length) + value;
  }
  const availableLabel = Math.max(width - value.length - 1, 1);
  return `${label.slice(0, availableLabel)} ${value}`.slice(0, width);
}

export function formatWhatsAppThermalReceipt(data: FiadoReceiptData): string {
  const width = WHATSAPP_LINE_WIDTH;
  const money = (cents: number) =>
    formatReceiptCurrency(cents, data.locale, data.currency);
  const lines: string[] = [];

  lines.push(centerText(data.storeName.toUpperCase().slice(0, width), width));
  if (data.storeAddress) {
    lines.push(centerText(data.storeAddress.slice(0, width), width));
  }
  if (data.storePhone) {
    lines.push(centerText(`Tel: ${data.storePhone}`.slice(0, width), width));
  }
  lines.push(repeat("=", width));
  lines.push(
    centerText(
      data.paymentMethod === "credit"
        ? data.locale === "es-419"
          ? "VENTA A CUENTA CORRIENTE"
          : "VENDA NO FIADO"
        : data.locale === "es-419"
          ? "COMPROBANTE DE PAGO"
          : "COMPROVANTE DE VENDA",
      width
    )
  );
  lines.push(repeat("-", width));
  lines.push(
    `${padRight(
      data.locale === "es-419" ? "Fecha" : "Data",
      16
    )}${formatReceiptDateTime(data.issuedAt, data.locale).slice(0, 16)}`
  );
  lines.push(
    `${padRight(
      data.locale === "es-419" ? "Comprobante" : "Comprovante",
      16
    )}${data.checksum.slice(0, 16)}`
  );
  if (data.customerName) {
    lines.push(
      `${padRight(
        data.locale === "es-419" ? "Cliente" : "Cliente",
        16
      )}${data.customerName.slice(0, 16)}`
    );
  }
  if (data.buyerName) {
    lines.push(
      `${padRight(
        data.locale === "es-419" ? "Comprador" : "Comprador",
        16
      )}${data.buyerName.slice(0, 16)}`
    );
  }
  lines.push(repeat("-", width));
  lines.push(
    `${padRight(
      data.locale === "es-419" ? "Artículo" : "Item",
      Math.max(width - 12, 8)
    )}${padLeft(data.locale === "es-419" ? "Importe" : "Valor", 11)}`
  );

  data.items.forEach((item) => {
    const nameLine = padRight(item.name, Math.max(width - 12, 8));
    const priceLine = padLeft(money(item.subtotalCents), 11);
    lines.push(`${nameLine}${priceLine}`);
    const detail = `  ${item.quantity} x ${money(item.unitPriceCents)}`;
    lines.push(detail.slice(0, width));
  });

  lines.push(repeat("-", width));
  lines.push(
    splitLabelValue(
      data.locale === "es-419" ? "Total" : "Total",
      money(data.subtotalCents),
      width
    )
  );

  if (data.paymentMethod === "cash") {
    if (data.tenderedCents != null) {
      lines.push(
        splitLabelValue(
          data.locale === "es-419" ? "Recibido" : "Recebido",
          money(data.tenderedCents),
          width
        )
      );
    }
    if (data.changeCents != null) {
      lines.push(
        splitLabelValue(
          data.locale === "es-419" ? "Cambio" : "Troco",
          money(data.changeCents),
          width
        )
      );
    }
  }

  if (data.paymentMethod === "credit") {
    if (data.debtBeforeCents != null) {
      lines.push(
        splitLabelValue(
          data.locale === "es-419" ? "Deuda previa" : "Dívida anterior",
          money(data.debtBeforeCents),
          width
        )
      );
    }
    if (data.debtAfterCents != null) {
      lines.push(
        splitLabelValue(
          data.locale === "es-419" ? "Deuda nueva" : "Nova dívida",
          money(data.debtAfterCents),
          width
        )
      );
    }
    if (data.debtLimitCents != null && data.debtLimitCents > 0) {
      lines.push(
        splitLabelValue(
          data.locale === "es-419" ? "Límite" : "Limite",
          money(data.debtLimitCents),
          width
        )
      );
    }
  }

  lines.push(repeat("=", width));
  if (data.footerNote) {
    lines.push(centerText(data.footerNote.slice(0, width), width));
  }
  lines.push(
    centerText(
      data.locale === "es-419"
        ? "Documento sin valor fiscal"
        : "Documento sem valor fiscal",
      width
    )
  );
  lines.push(
    centerText(
      data.locale === "es-419" ? "¡Gracias por su preferencia!" : "Obrigado pela preferência!",
      width
    )
  );

  if (data.qrCodeDataUrl) {
    lines.push("");
    lines.push(centerText("QR DE PAGO / PIX", width));
    lines.push(centerText(data.checksum, width));
  }

  if (data.signatureRequired && data.paymentMethod === "credit") {
    lines.push("");
    lines.push(centerText("________________________", width));
    lines.push(
      centerText(
        data.locale === "es-419" ? "Firma del cliente" : "Assinatura do cliente",
        width
      )
    );
  }

  const body = lines.join("\n");
  return `\`\`\`\n${body}\n\`\`\``;
}

export function formatQuickChargeMessage(input: {
  storeName: string;
  customerName: string;
  debtCents: number;
  locale: Locale;
  currency?: string;
}): string {
  const currency = input.currency ?? "BRL";
  const money = formatReceiptCurrency(input.debtCents, input.locale, currency);
  const title =
    input.locale === "es-419" ? "RECORDATORIO DE DEUDA" : "LEMBRETE DE DÍVIDA";
  const body =
    input.locale === "es-419"
      ? `Hola ${input.customerName}, su saldo en *${input.storeName}* es de *${money}*.`
      : `Olá ${input.customerName}, seu saldo na *${input.storeName}* é de *${money}*.`;
  const callToAction =
    input.locale === "es-419"
      ? "Para abonar, responda a este mensaje."
      : "Para quitar, responda esta mensagem.";
  return [centerText(title, WHATSAPP_LINE_WIDTH), "", body, "", callToAction].join("\n");
}
