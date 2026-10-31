import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { normalizeWhatsAppPhone } from "@/lib/payment/qr-billing-engine";
import type { Database } from "@/lib/supabase/database.types";

export interface SendAutomaticWhatsAppReceiptParams {
  supabase: SupabaseClient<Database>;
  tenantId: string;
  customerId: string | null;
  recipientPhone: string;
  messageBody: string;
  locale: Locale;
  payloadCents?: number | null;
}

export interface WhatsAppSendResult {
  ok: boolean;
  status: "sent" | "failed";
  logId: string | null;
  providerMessageId: string | null;
  error: string | null;
}

interface MetaGraphResponse {
  messages?: Array<{ id?: string; message_status?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

function resolveAccessToken(): string | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  return token && token.trim().length > 0 ? token : null;
}

function resolvePhoneNumberId(): string | null {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return id && id.trim().length > 0 ? id : null;
}

export async function sendAutomaticWhatsAppReceipt(
  params: SendAutomaticWhatsAppReceiptParams
): Promise<WhatsAppSendResult> {
  const { supabase, tenantId, customerId, recipientPhone, messageBody, locale } = params;
  const payloadCents = params.payloadCents ?? null;

  let logId: string | null = null;

  try {
    const insertResult = await supabase
      .from("whatsapp_delivery_logs")
      .insert({
        tenant_id: tenantId,
        customer_id: customerId,
        recipient_phone: recipientPhone,
        message_body: messageBody,
        payload_cents: payloadCents,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertResult.error || !insertResult.data) {
      return {
        ok: false,
        status: "failed",
        logId: null,
        providerMessageId: null,
        error: insertResult.error?.message ?? "log_insert_failed",
      };
    }

    logId = insertResult.data.id;

    const failWith = async (error: string): Promise<WhatsAppSendResult> => {
      if (logId) {
        await supabase
          .from("whatsapp_delivery_logs")
          .update({ status: "failed", error_message: error })
          .eq("id", logId);
      }
      return {
        ok: false,
        status: "failed",
        logId,
        providerMessageId: null,
        error,
      };
    };

    const accessToken = resolveAccessToken();
    const phoneNumberId = resolvePhoneNumberId();
    if (!accessToken || !phoneNumberId) {
      return await failWith("whatsapp_not_configured");
    }

    const normalizedPhone = normalizeWhatsAppPhone(recipientPhone, locale);
    if (!normalizedPhone) {
      return await failWith("invalid_recipient_phone");
    }

    const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: messageBody,
        },
      }),
      cache: "no-store",
    });

    const raw = (await response.json().catch(() => null)) as MetaGraphResponse | null;

    if (!response.ok || !raw || raw.error) {
      const errorMessage =
        raw?.error?.message ?? `meta_http_${response.status}`;
      return await failWith(errorMessage);
    }

    const providerMessageId = raw.messages?.[0]?.id ?? null;
    await supabase
      .from("whatsapp_delivery_logs")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        error_message: null,
      })
      .eq("id", logId);

    return {
      ok: true,
      status: "sent",
      logId,
      providerMessageId,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "whatsapp_dispatch_failed";
    if (logId) {
      await supabase
        .from("whatsapp_delivery_logs")
        .update({ status: "failed", error_message: message })
        .eq("id", logId);
    }
    return {
      ok: false,
      status: "failed",
      logId,
      providerMessageId: null,
      error: message,
    };
  }
}
