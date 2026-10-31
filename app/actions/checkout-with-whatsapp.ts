"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import {
  generateReceiptChecksum,
  type FiadoReceiptData,
} from "@/lib/printer/receipt-types";
import {
  buildPaymentQRCodePayload,
  generatePaymentQRCodeDataUrl,
} from "@/lib/payment/qr-billing-engine";
import { formatWhatsAppThermalReceipt } from "@/lib/whatsapp/receipt-formatter";
import { sendAutomaticWhatsAppReceipt } from "@/lib/whatsapp/whatsapp-client";
import { checkoutSchema, type ActionResult } from "@/lib/validation/schemas";
import type { CheckoutSaleResult } from "@/lib/supabase/database.types";

export interface CheckoutActionResultData {
  receipt: FiadoReceiptData;
  whatsappScheduled: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  tenant_mismatch: "Sessão inválida para esta loja",
  empty_cart: "O carrinho está vazio",
  invalid_payment_method: "Forma de pagamento inválida",
  customer_required_for_credit: "Selecione o cliente para venda no fiado",
  product_not_found: "Um dos produtos não foi encontrado",
  product_inactive: "Um dos produtos está inativo",
  insufficient_stock: "Estoque insuficiente para concluir a venda",
  credit_limit_exceeded: "Limite de crédito do cliente excedido",
  customer_not_found_or_forbidden: "Cliente inválido",
  invalid_quantity: "Quantidade inválida no carrinho",
  operator_required: "Operador não identificado",
  invalid_tendered_amount: "Valor recebido inválido",
};

function mapCheckoutError(code: string | undefined): string {
  if (!code) {
    return "Não foi possível concluir a venda";
  }
  return ERROR_MESSAGES[code] ?? `Falha na venda: ${code}`;
}

export async function checkoutWithWhatsAppAction(
  rawInput: unknown
): Promise<ActionResult<CheckoutActionResultData>> {
  const parsed = checkoutSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados da venda",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const input = parsed.data;
  const features = normalizeFeatures(context.features);

  if (input.paymentMethod === "credit" && !features.fiado) {
    return {
      ok: false,
      error: "Recurso de fiado desativado para esta loja",
      code: "feature_disabled",
    };
  }

  const { supabase, userId, profile, tenant } = context;

  const { data, error } = await supabase.rpc("checkout_sale", {
    p_tenant_id: tenant.id,
    p_operator_id: userId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    p_payment_method: input.paymentMethod,
    p_customer_id: input.paymentMethod === "credit" ? input.customerId ?? null : null,
    p_tendered_cents: input.paymentMethod === "cash" ? input.tenderedCents ?? null : null,
    p_notes: input.notes ?? null,
  });

  if (error || !data) {
    const code = error?.message?.split(":")[0]?.trim();
    return {
      ok: false,
      error: mapCheckoutError(code),
      code: code ?? "checkout_failed",
    };
  }

  const sale = data as CheckoutSaleResult;
  const locale: Locale = input.locale;

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  let debtLimitCents: number | null = null;

  if (sale.customer_id) {
    const customerResult = await supabase
      .from("customers")
      .select("full_name, phone_number, credit_limit_cents")
      .eq("id", sale.customer_id)
      .maybeSingle();
    if (customerResult.data) {
      customerName = customerResult.data.full_name;
      customerPhone = customerResult.data.phone_number;
      debtLimitCents = customerResult.data.credit_limit_cents;
    }
  }

  const isCredit = sale.payment_method === "credit";
  let qrCodeDataUrl: string | null = null;

  if (isCredit && sale.customer_id && features.fiado) {
    try {
      const payload = buildPaymentQRCodePayload({
        tenantId: tenant.id,
        customerId: sale.customer_id,
        amountCents: sale.debt_after_cents,
        reference: sale.sale_id,
        kind: "fiado_full_settlement",
      });
      qrCodeDataUrl = await generatePaymentQRCodeDataUrl(payload, { width: 1024 });
    } catch {
      qrCodeDataUrl = null;
    }
  }

  const receipt: FiadoReceiptData = {
    storeName: tenant.name,
    storeAddress: tenant.address,
    storePhone: tenant.phone,
    currency: tenant.currency,
    locale,
    width: tenant.receiptWidth,
    saleId: sale.sale_id,
    issuedAt: sale.issued_at,
    checksum: generateReceiptChecksum(`${sale.sale_id}:${sale.issued_at}`),
    paymentMethod: sale.payment_method,
    items: sale.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    })),
    subtotalCents: sale.subtotal_cents,
    creditedCents: sale.credited_cents,
    tenderedCents: sale.tendered_cents,
    changeCents: sale.change_cents,
    customerName,
    customerPhone,
    buyerName: input.paymentMethod === "credit" ? input.buyerName ?? null : null,
    debtBeforeCents: isCredit ? sale.debt_before_cents : null,
    debtAfterCents: isCredit ? sale.debt_after_cents : null,
    debtLimitCents,
    operatorName: profile.fullName,
    qrCodeDataUrl,
    signatureRequired: isCredit,
    footerNote: null,
  };

  const wantsWhatsApp =
    input.sendWhatsApp && features.whatsapp && Boolean(customerPhone);
  let whatsappScheduled = false;

  if (wantsWhatsApp && customerPhone && sale.customer_id) {
    const receiptText = formatWhatsAppThermalReceipt(receipt);
    const tenantId = tenant.id;
    const customerId = sale.customer_id;
    const phone = customerPhone;
    const amountCents = sale.subtotal_cents;
    whatsappScheduled = true;

    after(async () => {
      await sendAutomaticWhatsAppReceipt({
        supabase,
        tenantId,
        customerId,
        recipientPhone: phone,
        messageBody: receiptText,
        locale,
        payloadCents: amountCents,
      });
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/pdv");
  revalidatePath("/produtos");
  revalidatePath("/fiado");

  return {
    ok: true,
    data: {
      receipt,
      whatsappScheduled,
    },
  };
}
