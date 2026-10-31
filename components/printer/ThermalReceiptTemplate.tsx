import type { FiadoReceiptData } from "@/lib/printer/receipt-types";
import {
  formatReceiptCurrency,
  formatReceiptDateTime,
} from "@/lib/printer/receipt-types";

export interface ThermalReceiptTemplateProps {
  data: FiadoReceiptData;
  className?: string;
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`receipt-row ${bold ? "receipt-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ThermalReceiptTemplate({
  data,
  className = "",
}: ThermalReceiptTemplateProps) {
  const money = (cents: number) =>
    formatReceiptCurrency(cents, data.locale, data.currency);
  const widthClass = data.width === "80mm" ? "receipt-80" : "receipt-58";
  const isCredit = data.paymentMethod === "credit";
  const saleLabel =
    data.locale === "es-419"
      ? isCredit
        ? "VENTA A CUENTA CORRIENTE"
        : "COMPROBANTE DE PAGO"
      : isCredit
        ? "VENDA NO FIADO"
        : "COMPROVANTE DE VENDA";
  const dateLabel = data.locale === "es-419" ? "Fecha" : "Data";
  const itemsLabel = data.locale === "es-419" ? "Artículos" : "Itens";
  const totalLabel = data.locale === "es-419" ? "Total" : "Total";
  const receivedLabel = data.locale === "es-419" ? "Recibido" : "Recebido";
  const changeLabel = data.locale === "es-419" ? "Cambio" : "Troco";
  const debtBeforeLabel = data.locale === "es-419" ? "Deuda previa" : "Dívida anterior";
  const debtAfterLabel = data.locale === "es-419" ? "Deuda nueva" : "Nova dívida";
  const limitLabel = data.locale === "es-419" ? "Límite" : "Limite";
  const operatorLabel = data.locale === "es-419" ? "Operador" : "Operador";
  const signatureLabel =
    data.locale === "es-419"
      ? "Firma del cliente (confesión de deuda)"
      : "Assinatura do cliente (confissão de dívida)";
  const footerLabel =
    data.locale === "es-419" ? "Documento sin valor fiscal" : "Documento sem valor fiscal";
  const thanksLabel =
    data.locale === "es-419" ? "¡Gracias por su preferencia!" : "Obrigado pela preferência!";

  return (
    <div
      className={`receipt-paper print-root ${widthClass} ${className}`}
      data-receipt-width={data.width}
    >
      <div className="receipt-center receipt-bold">
        {data.storeName.toUpperCase()}
      </div>
      {data.storeAddress ? (
        <div className="receipt-center receipt-muted">{data.storeAddress}</div>
      ) : null}
      {data.storePhone ? (
        <div className="receipt-center receipt-muted">Tel: {data.storePhone}</div>
      ) : null}

      <div className="receipt-dashed" />

      <div className="receipt-center receipt-bold">{saleLabel}</div>

      <Row label={dateLabel} value={formatReceiptDateTime(data.issuedAt, data.locale)} />
      <Row label="Cupom" value={data.checksum} />
      <Row label="Venda" value={data.saleId.slice(0, 18)} />
      {data.customerName ? <Row label="Cliente" value={data.customerName} /> : null}
      {data.operatorName ? <Row label={operatorLabel} value={data.operatorName} /> : null}

      <div className="receipt-dashed" />

      <div className="receipt-bold receipt-row">
        <span>{itemsLabel}</span>
        <span>
          {data.locale === "es-419" ? "Importe" : "Valor"}
        </span>
      </div>

      <div className="mt-1">
        {data.items.map((item, index) => (
          <div key={`${data.saleId}-item-${index}`} className="mb-1">
            <div className="receipt-row">
              <span className="receipt-bold">{item.name}</span>
              <span className="receipt-bold tabular-nums">
                {money(item.subtotalCents)}
              </span>
            </div>
            <div className="receipt-muted tabular-nums">
              {item.quantity} {item.unit} x {money(item.unitPriceCents)}
            </div>
          </div>
        ))}
      </div>

      <div className="receipt-dashed" />

      <Row label={totalLabel} value={money(data.subtotalCents)} bold />

      {!isCredit ? (
        <>
          {data.tenderedCents != null ? (
            <Row label={receivedLabel} value={money(data.tenderedCents)} />
          ) : null}
          {data.changeCents != null ? (
            <Row label={changeLabel} value={money(data.changeCents)} />
          ) : null}
        </>
      ) : null}

      {isCredit ? (
        <>
          {data.debtBeforeCents != null ? (
            <Row label={debtBeforeLabel} value={money(data.debtBeforeCents)} />
          ) : null}
          <Row
            label={debtAfterLabel}
            value={data.debtAfterCents != null ? money(data.debtAfterCents) : "-"}
            bold
          />
          {data.debtLimitCents != null && data.debtLimitCents > 0 ? (
            <Row label={limitLabel} value={money(data.debtLimitCents)} />
          ) : null}
        </>
      ) : null}

      <div className="receipt-dashed" />

      {data.qrCodeDataUrl ? (
        <div className="mb-2 text-center">
          <div className="receipt-center receipt-bold">QR DE PAGO / PIX</div>
          <img
            src={data.qrCodeDataUrl}
            alt="QR Code de pagamento"
            width={180}
            height={180}
            style={{ width: 180, height: 180 }}
            className="mx-auto"
          />
          <div className="receipt-center receipt-muted">{data.checksum}</div>
        </div>
      ) : null}

      <div className="receipt-center receipt-muted">{data.footerNote ?? footerLabel}</div>
      <div className="receipt-center receipt-muted">{thanksLabel}</div>

      {data.signatureRequired && isCredit ? (
        <div className="receipt-signature">
          <div className="receipt-center receipt-bold">
            {data.locale === "es-419" ? "CONFESIÓN DE DEUDA" : "CONFISSÃO DE DÍVIDA"}
          </div>
          <div className="receipt-dashed" />
          <div className="receipt-center">
            {data.customerName ?? "________________________________"}
          </div>
          <div className="receipt-center receipt-muted">{signatureLabel}</div>
        </div>
      ) : null}
    </div>
  );
}
