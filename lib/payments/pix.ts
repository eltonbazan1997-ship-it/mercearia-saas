export interface PixPaymentInput {
  key: string;
  name: string;
  city: string;
  amountCents: number;
  txId?: string;
  description?: string;
}

function formatEmvField(id: string, value: string): string {
  const size = String(value.length).padStart(2, "0");
  return `${id}${size}${value}`;
}

export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function normalizePixText(value: string, maxLength: number): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return normalized.slice(0, maxLength);
}

function normalizeTxId(txId: string | undefined): string {
  const cleaned = (txId ?? "MERCEARIA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 25);
  return cleaned || "MERCEARIA";
}

export function buildPixPayload(input: PixPaymentInput): string | null {
  const key = input.key.trim();
  if (!key) {
    return null;
  }

  const merchantAccount =
    formatEmvField("00", "br.gov.bcb.pix") + formatEmvField("01", key);

  const merchantCategory = "0000";
  const currency = "986";

  const amount =
    input.amountCents > 0 ? (input.amountCents / 100).toFixed(2) : "";

  const additionalData = formatEmvField("05", normalizeTxId(input.txId));

  const fields = [
    formatEmvField("00", "01"),
    formatEmvField("01", "12"),
    formatEmvField("26", merchantAccount),
    formatEmvField("52", merchantCategory),
    formatEmvField("53", currency),
  ];

  if (amount) {
    fields.push(formatEmvField("54", amount));
  }

  fields.push(
    formatEmvField("58", "BR"),
    formatEmvField("59", normalizePixText(input.name, 25) || "MERCADO"),
    formatEmvField("60", normalizePixText(input.city, 15) || "BRASIL"),
    formatEmvField("62", additionalData)
  );

  const body = fields.join("");
  const withCrc = `${body}6304`;
  return `${withCrc}${crc16Ccitt(withCrc)}`;
}
