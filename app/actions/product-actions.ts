"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import type { ProductCatalogItem } from "@/lib/stock-engine";
import {
  createProductSchema,
  updateProductSchema,
  type ActionResult,
} from "@/lib/validation/schemas";
import type { ProductRow } from "@/lib/supabase/database.types";

function toCatalogItem(row: ProductRow): ProductCatalogItem {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    category: row.category,
    unit: row.unit,
    costPriceCents: row.cost_price_cents,
    salePriceCents: row.sale_price_cents,
    creditPriceCents:
      typeof row.credit_price_cents === "number" &&
      row.credit_price_cents > 0
        ? row.credit_price_cents
        : row.sale_price_cents,
    stockQuantity: row.stock_quantity,
    minStockAlert: row.min_stock_alert,
    expiresOn: row.expires_on,
    isActive: row.is_active,
  };
}

function isDuplicateBarcodeError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }
  return (
    message.includes("products_tenant_barcode_uniq") ||
    message.includes("duplicate key value") ||
    message.includes("23505")
  );
}

export async function createProductAction(
  rawInput: unknown
): Promise<ActionResult<ProductCatalogItem>> {
  const parsed = createProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados do produto",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const input = parsed.data;
  const barcode = input.barcode ?? null;

  if (barcode) {
    const duplicate = await context.supabase
      .from("products")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("barcode", barcode)
      .maybeSingle();

    if (duplicate.data) {
      return {
        ok: false,
        error: "Já existe um produto com este código de barras",
        code: "duplicate_barcode",
        fieldErrors: { barcode: ["Código já cadastrado nesta loja"] },
      };
    }
  }

  const insertResult = await context.supabase
    .from("products")
    .insert({
      tenant_id: context.tenant.id,
      name: input.name,
      barcode,
      category: input.category,
      unit: input.unit,
      cost_price_cents: input.costPriceCents,
      sale_price_cents: input.salePriceCents,
      credit_price_cents: input.creditPriceCents ?? input.salePriceCents,
      stock_quantity: input.stockQuantity,
      min_stock_alert: input.minStockAlert,
      expires_on: input.expiresOn ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    const message = insertResult.error?.message;
    if (isDuplicateBarcodeError(message)) {
      return {
        ok: false,
        error: "Já existe um produto com este código de barras",
        code: "duplicate_barcode",
        fieldErrors: { barcode: ["Código já cadastrado nesta loja"] },
      };
    }
    return {
      ok: false,
      error: message ? `Falha ao salvar: ${message}` : "Falha ao salvar o produto",
      code: "insert_failed",
    };
  }

  revalidatePath("/produtos");
  revalidatePath("/pdv");
  return { ok: true, data: toCatalogItem(insertResult.data) };
}

export async function updateProductAction(
  rawInput: unknown
): Promise<ActionResult<ProductCatalogItem>> {
  const parsed = updateProductSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados do produto",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const input = parsed.data;
  const barcode = input.barcode ?? null;

  if (barcode) {
    const duplicate = await context.supabase
      .from("products")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("barcode", barcode)
      .neq("id", input.id)
      .maybeSingle();

    if (duplicate.data) {
      return {
        ok: false,
        error: "Outro produto já usa este código de barras",
        code: "duplicate_barcode",
        fieldErrors: { barcode: ["Código já cadastrado nesta loja"] },
      };
    }
  }

  const updateResult = await context.supabase
    .from("products")
    .update({
      name: input.name,
      barcode,
      category: input.category,
      unit: input.unit,
      cost_price_cents: input.costPriceCents,
      sale_price_cents: input.salePriceCents,
      credit_price_cents: input.creditPriceCents ?? input.salePriceCents,
      stock_quantity: input.stockQuantity,
      min_stock_alert: input.minStockAlert,
      expires_on: input.expiresOn ?? null,
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    })
    .eq("id", input.id)
    .eq("tenant_id", context.tenant.id)
    .select("*")
    .single();

  if (updateResult.error || !updateResult.data) {
    const message = updateResult.error?.message;
    if (isDuplicateBarcodeError(message)) {
      return {
        ok: false,
        error: "Já existe um produto com este código de barras",
        code: "duplicate_barcode",
        fieldErrors: { barcode: ["Código já cadastrado nesta loja"] },
      };
    }
    return {
      ok: false,
      error: "Não foi possível atualizar o produto",
      code: "update_failed",
    };
  }

  revalidatePath("/produtos");
  revalidatePath("/pdv");
  return { ok: true, data: toCatalogItem(updateResult.data) };
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean
): Promise<ActionResult<ProductCatalogItem>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const result = await context.supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .eq("tenant_id", context.tenant.id)
    .select("*")
    .single();

  if (result.error || !result.data) {
    return { ok: false, error: "Não foi possível alterar o produto", code: "update_failed" };
  }

  revalidatePath("/produtos");
  revalidatePath("/pdv");
  return { ok: true, data: toCatalogItem(result.data) };
}

export async function deleteProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const { error } = await context.supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("tenant_id", context.tenant.id);

  if (error) {
    return { ok: false, error: error.message || "Não foi possível excluir o produto", code: "delete_failed" };
  }

  revalidatePath("/produtos");
  revalidatePath("/pdv");
  return { ok: true, data: { id: productId } };
}

export async function deleteProductsBatchAction(
  productIds: string[]
): Promise<ActionResult<{ count: number }>> {
  if (!productIds || productIds.length === 0) {
    return { ok: true, data: { count: 0 } };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const { error } = await context.supabase
    .from("products")
    .delete()
    .in("id", productIds)
    .eq("tenant_id", context.tenant.id);

  if (error) {
    return { ok: false, error: error.message || "Não foi possível excluir os produtos", code: "delete_failed" };
  }

  revalidatePath("/produtos");
  revalidatePath("/pdv");
  return { ok: true, data: { count: productIds.length } };
}
