"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import {
  DEFAULT_TENANT_FEATURES,
  normalizeFeatures,
  type FeatureKey,
  type TenantFeatures,
} from "@/lib/features";
import { toggleFeatureSchema, type ActionResult } from "@/lib/validation/schemas";

export async function getTenantFeaturesAction(): Promise<ActionResult<TenantFeatures>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  return { ok: true, data: normalizeFeatures(context.features) };
}

export async function setTenantFeatureAction(
  rawInput: unknown
): Promise<ActionResult<TenantFeatures>> {
  const parsed = toggleFeatureSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Recurso inválido",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const key: FeatureKey = parsed.data.key;
  const enabled = parsed.data.enabled;

  if (!context.features) {
    const insertResult = await context.supabase
      .from("tenant_features")
      .insert({
        tenant_id: context.tenant.id,
        ...DEFAULT_TENANT_FEATURES,
        [key]: enabled,
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return {
        ok: false,
        error: "Não foi possível salvar o recurso",
        code: "upsert_failed",
      };
    }

    revalidatePath("/configuracoes");
    revalidatePath("/pdv");
    return { ok: true, data: normalizeFeatures(insertResult.data) };
  }

  const updatePayload: { -readonly [K in FeatureKey]?: boolean } = {};
  updatePayload[key] = enabled;

  const updateResult = await context.supabase
    .from("tenant_features")
    .update(updatePayload)
    .eq("tenant_id", context.tenant.id)
    .select("*")
    .single();

  if (updateResult.error || !updateResult.data) {
    return {
      ok: false,
      error: "Não foi possível salvar o recurso",
      code: "update_failed",
    };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/pdv");
  revalidatePath("/fiado");

  return { ok: true, data: normalizeFeatures(updateResult.data) };
}
