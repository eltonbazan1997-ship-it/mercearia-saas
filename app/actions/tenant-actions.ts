"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import {
  updateTenantProfileSchema,
  type ActionResult,
} from "@/lib/validation/schemas";
import type { TenantRow } from "@/lib/supabase/database.types";

export interface TenantProfilePayload {
  id: string;
  name: string;
  currency: string;
  locale: "pt-BR" | "es-419";
  phone: string | null;
  address: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixName: string | null;
  pixCity: string | null;
  bobQrImage: string | null;
}

function toTenantProfile(row: TenantRow): TenantProfilePayload {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    locale: row.locale,
    phone: row.phone,
    address: row.address,
    pixKey: row.pix_key,
    pixKeyType: row.pix_key_type,
    pixName: row.pix_name,
    pixCity: row.pix_city,
    bobQrImage: row.bob_qr_image,
  };
}

export async function updateTenantProfileAction(
  rawInput: unknown
): Promise<ActionResult<TenantProfilePayload>> {
  const parsed = updateTenantProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados do perfil",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }
  if (context.profile.role !== "owner" && context.profile.role !== "manager") {
    return {
      ok: false,
      error: "Apenas o proprietário ou gerente pode editar o perfil da empresa",
      code: "forbidden",
    };
  }

  const input = parsed.data;
  const updateResult = await context.supabase
    .from("tenants")
    .update({
      name: input.name,
      currency: input.currency,
      locale: input.locale,
      phone: input.phone ?? null,
      address: input.address ?? null,
      pix_key: input.pixKey ?? null,
      pix_key_type: input.pixKeyType ?? null,
      pix_name: input.pixName ?? null,
      pix_city: input.pixCity ?? null,
      bob_qr_image: input.bobQrImage ?? null,
    })
    .eq("id", context.tenant.id)
    .select("*")
    .single();

  if (updateResult.error || !updateResult.data) {
    return {
      ok: false,
      error: updateResult.error?.message ?? "Não foi possível salvar o perfil",
      code: "update_failed",
    };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/pdv");
  revalidatePath("/fiado");
  revalidatePath("/produtos");

  return { ok: true, data: toTenantProfile(updateResult.data) };
}
