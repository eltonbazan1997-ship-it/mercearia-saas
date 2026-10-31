"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import {
  buildFiadoStatementMessage,
  buildPaymentQRCodePayload,
  buildWhatsAppBillingLink,
} from "@/lib/payment/qr-billing-engine";
import { formatQuickChargeMessage } from "@/lib/whatsapp/receipt-formatter";
import { sendAutomaticWhatsAppReceipt } from "@/lib/whatsapp/whatsapp-client";
import {
  createCustomerSchema,
  settleDebtSchema,
  updateCustomerSchema,
  type ActionResult,
} from "@/lib/validation/schemas";
import type {
  CreditTransactionRow,
  CustomerRow,
} from "@/lib/supabase/database.types";

export interface CustomerLedgerEntry {
  id: string;
  type: "debit" | "payment" | "adjustment";
  amountCents: number;
  balanceAfterCents: number;
  notes: string | null;
  createdAt: string;
  saleId: string | null;
  items?: Array<{ productName: string; quantity: number; unitPriceCents: number; subtotalCents: number }>;
}

export interface CustomerLedgerPayload {
  customer: {
    id: string;
    fullName: string;
    phoneNumber: string | null;
    debtCents: number;
    creditLimitCents: number;
    notes: string | null;
    trustedPerson1Name: string | null;
    trustedPerson1Phone: string | null;
    trustedPerson2Name: string | null;
    trustedPerson2Phone: string | null;
  };
  entries: CustomerLedgerEntry[];
}

function toLedgerEntry(row: CreditTransactionRow): CustomerLedgerEntry {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    balanceAfterCents: row.balance_after_cents,
    notes: row.notes,
    createdAt: row.created_at,
    saleId: row.sale_id,
  };
}

export async function createCustomerAction(
  rawInput: unknown
): Promise<ActionResult<{ customerId: string }>> {
  const parsed = createCustomerSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados do cliente",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }
  if (!normalizeFeatures(context.features).fiado) {
    return { ok: false, error: "Recurso de fiado desativado", code: "feature_disabled" };
  }

  const input = parsed.data;
  const insertResult = await context.supabase
    .from("customers")
    .insert({
      tenant_id: context.tenant.id,
      full_name: input.fullName,
      phone_number: input.phoneNumber ?? null,
      credit_limit_cents: input.creditLimitCents,
      notes: input.notes ?? null,
      trusted_person_1_name: input.trustedPerson1Name || null,
      trusted_person_1_phone: input.trustedPerson1Phone || null,
      trusted_person_2_name: input.trustedPerson2Name || null,
      trusted_person_2_phone: input.trustedPerson2Phone || null,
      debt_cents: 0,
    })
    .select("id")
    .single();

  if (insertResult.error || !insertResult.data) {
    return {
      ok: false,
      error: insertResult.error?.message ?? "Falha ao cadastrar o cliente",
      code: "insert_failed",
    };
  }

  revalidatePath("/fiado");
  revalidatePath("/pdv");
  return { ok: true, data: { customerId: insertResult.data.id } };
}

export async function updateCustomerAction(
  rawInput: unknown
): Promise<ActionResult<{ customerId: string }>> {
  const parsed = updateCustomerSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados do cliente",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }
  if (!normalizeFeatures(context.features).fiado) {
    return { ok: false, error: "Recurso de fiado desativado", code: "feature_disabled" };
  }

  const input = parsed.data;
  const updateResult = await context.supabase
    .from("customers")
    .update({
      full_name: input.fullName,
      phone_number: input.phoneNumber ?? null,
      credit_limit_cents: input.creditLimitCents,
      notes: input.notes ?? null,
      trusted_person_1_name: input.trustedPerson1Name || null,
      trusted_person_1_phone: input.trustedPerson1Phone || null,
      trusted_person_2_name: input.trustedPerson2Name || null,
      trusted_person_2_phone: input.trustedPerson2Phone || null,
    })
    .eq("id", input.id)
    .eq("tenant_id", context.tenant.id)
    .select("id")
    .single();

  if (updateResult.error || !updateResult.data) {
    return {
      ok: false,
      error: updateResult.error?.message ?? "Falha ao atualizar o cliente",
      code: "update_failed",
    };
  }

  revalidatePath("/fiado");
  revalidatePath("/pdv");
  return { ok: true, data: { customerId: updateResult.data.id } };
}

export async function settleCustomerDebtAction(
  rawInput: unknown
): Promise<ActionResult<{ appliedCents: number; remainingDebtCents: number }>> {
  const parsed = settleDebtSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique o valor do abono",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }
  if (!normalizeFeatures(context.features).fiado) {
    return { ok: false, error: "Recurso de fiado desativado", code: "feature_disabled" };
  }

  const input = parsed.data;

  const { data, error } = await context.supabase.rpc("settle_customer_debt", {
    p_tenant_id: context.tenant.id,
    p_customer_id: input.customerId,
    p_operator_id: context.userId,
    p_amount_cents: input.amountCents,
    p_notes: input.notes ?? null,
  });

  if (error) {
    const code = error.message?.split(":")[0]?.trim();
    if (code === "customer_not_found_or_forbidden") {
      return { ok: false, error: "Cliente inválido", code };
    }
    if (code === "invalid_amount") {
      return { ok: false, error: "Valor do abono inválido", code };
    }
    return {
      ok: false,
      error: error.message ?? "Não foi possível registrar o abono",
      code: code ?? "settle_failed",
    };
  }

  const appliedCents = typeof data === "number" ? data : 0;
  const ledger = await getCustomerLedgerAction(input.customerId);
  const remainingDebtCents = ledger.ok ? ledger.data.customer.debtCents : 0;

  revalidatePath("/fiado");
  revalidatePath("/pdv");

  return { ok: true, data: { appliedCents, remainingDebtCents } };
}

export async function getCustomerLedgerAction(
  customerId: string
): Promise<ActionResult<CustomerLedgerPayload>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const customerResult = await context.supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();

  if (customerResult.error || !customerResult.data) {
    return { ok: false, error: "Cliente não encontrado", code: "not_found" };
  }

  const entriesResult = await context.supabase
    .from("credit_transactions")
    .select("*")
    .eq("customer_id", customerId)
    .eq("tenant_id", context.tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (entriesResult.error) {
    return { ok: false, error: "Falha ao carregar o extrato", code: "load_failed" };
  }

  const entries = entriesResult.data ?? [];
  const saleIds = entries.map((e) => e.sale_id).filter(Boolean) as string[];

  const saleItemsMap = new Map<string, Array<{ productName: string; quantity: number; unitPriceCents: number; subtotalCents: number }>>();
  if (saleIds.length > 0) {
    const itemsResult = await context.supabase
      .from("sale_items")
      .select("*")
      .in("sale_id", saleIds);

    if (itemsResult.data) {
      for (const item of itemsResult.data) {
        const list = saleItemsMap.get(item.sale_id) ?? [];
        list.push({
          productName: item.product_name,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          subtotalCents: item.subtotal_cents,
        });
        saleItemsMap.set(item.sale_id, list);
      }
    }
  }

  const customer = customerResult.data as CustomerRow;
  const mappedEntries: CustomerLedgerEntry[] = entries.map((row) => ({
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    balanceAfterCents: row.balance_after_cents,
    notes: row.notes,
    createdAt: row.created_at,
    saleId: row.sale_id,
    items: row.sale_id ? saleItemsMap.get(row.sale_id) : undefined,
  }));

  return {
    ok: true,
    data: {
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        phoneNumber: customer.phone_number,
        debtCents: customer.debt_cents,
        creditLimitCents: customer.credit_limit_cents,
        notes: customer.notes,
        trustedPerson1Name: customer.trusted_person_1_name,
        trustedPerson1Phone: customer.trusted_person_1_phone,
        trustedPerson2Name: customer.trusted_person_2_name,
        trustedPerson2Phone: customer.trusted_person_2_phone,
      },
      entries: mappedEntries,
    },
  };
}

export async function deleteCustomerAction(
  customerId: string
): Promise<ActionResult<{ customerId: string }>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }
  if (!normalizeFeatures(context.features).fiado) {
    return { ok: false, error: "Recurso de fiado desativado", code: "feature_disabled" };
  }

  const cust = await context.supabase
    .from("customers")
    .select("debt_cents")
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id)
    .single();

  if (cust.data && cust.data.debt_cents > 0) {
    return {
      ok: false,
      error: "Não é possível excluir cliente com saldo devedor em aberto",
      code: "has_debt",
    };
  }

  const { error } = await context.supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id);

  if (error) {
    return { ok: false, error: error.message || "Falha ao excluir cliente", code: "delete_failed" };
  }

  revalidatePath("/fiado");
  revalidatePath("/pdv");
  return { ok: true, data: { customerId } };
}

export interface ChargeDispatchResult {
  sent: boolean;
  viaLink: boolean;
  whatsappUrl: string | null;
}

export async function sendFiadoChargeAction(
  customerId: string
): Promise<ActionResult<ChargeDispatchResult>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const features = normalizeFeatures(context.features);
  if (!features.fiado) {
    return { ok: false, error: "Recurso de fiado desativado", code: "feature_disabled" };
  }

  const customerResult = await context.supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();

  if (!customerResult.data) {
    return { ok: false, error: "Cliente não encontrado", code: "not_found" };
  }

  const customer = customerResult.data;
  if (!customer.phone_number) {
    return {
      ok: false,
      error: "Cliente sem telefone cadastrado",
      code: "phone_required",
    };
  }

  const entriesResult = await context.supabase
    .from("credit_transactions")
    .select("*")
    .eq("customer_id", customerId)
    .eq("tenant_id", context.tenant.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const locale = context.tenant.locale;
  const statementMessage = buildFiadoStatementMessage({
    storeName: context.tenant.name,
    customerName: customer.full_name,
    debtCents: customer.debt_cents,
    locale,
    currency: context.tenant.currency,
    entries: (entriesResult.data ?? []).map((row) => ({
      createdAt: row.created_at,
      type: row.type,
      amountCents: row.amount_cents,
      balanceAfterCents: row.balance_after_cents,
      notes: row.notes,
    })),
  });

  const whatsappUrl = buildWhatsAppBillingLink(
    customer.phone_number,
    statementMessage,
    locale
  );

  if (!features.whatsapp) {
    return {
      ok: true,
      data: { sent: false, viaLink: true, whatsappUrl },
    };
  }

  const quickMessage = formatQuickChargeMessage({
    storeName: context.tenant.name,
    customerName: customer.full_name,
    debtCents: customer.debt_cents,
    locale,
    currency: context.tenant.currency,
  });

  const dispatch = await sendAutomaticWhatsAppReceipt({
    supabase: context.supabase,
    tenantId: context.tenant.id,
    customerId: customer.id,
    recipientPhone: customer.phone_number,
    messageBody: quickMessage,
    locale,
    payloadCents: customer.debt_cents,
  });

  revalidatePath("/fiado");

  if (!dispatch.ok) {
    return {
      ok: false,
      error: `Falha no envio: ${dispatch.error ?? "desconhecida"}`,
      code: dispatch.error ?? "dispatch_failed",
    };
  }

  return { ok: true, data: { sent: true, viaLink: false, whatsappUrl } };
}
