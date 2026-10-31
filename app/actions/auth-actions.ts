"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  signInSchema,
  signUpSchema,
  type ActionResult,
} from "@/lib/validation/schemas";

export interface AuthSessionResult {
  userId: string;
}

export async function signInAction(
  rawInput: unknown
): Promise<ActionResult<AuthSessionResult>> {
  const parsed = signInSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique o e-mail e a senha",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error:
        error?.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos"
          : error?.message ?? "Falha ao entrar",
      code: "sign_in_failed",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { userId: data.user.id } };
}

export async function signUpAction(
  rawInput: unknown
): Promise<ActionResult<AuthSessionResult>> {
  const parsed = signUpSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Verifique os dados da conta",
      code: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        tenant_name: parsed.data.storeName,
        locale: parsed.data.locale,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message ?? "Falha ao criar a conta",
      code: "sign_up_failed",
    };
  }

  if (!data.user) {
    return {
      ok: false,
      error: "Confirme o e-mail enviado para concluir o cadastro",
      code: "email_confirmation_required",
    };
  }

  if (!data.session) {
    return {
      ok: false,
      error: "Confirme o e-mail enviado para concluir o cadastro",
      code: "email_confirmation_required",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { userId: data.user.id } };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
