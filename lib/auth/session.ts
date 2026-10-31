import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/i18n/fiado-dictionary";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface SessionProfile {
  id: string;
  tenantId: string;
  fullName: string;
  role: "owner" | "manager" | "cashier";
  locale: Locale;
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string | null;
  locale: Locale;
  currency: string;
  receiptWidth: "58mm" | "80mm";
  address: string | null;
  phone: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  pixName: string | null;
  pixCity: string | null;
  bobQrImage: string | null;
}

export interface SessionContext {
  supabase: SupabaseServerClient;
  userId: string;
  profile: SessionProfile;
  tenant: SessionTenant;
  features: Database["public"]["Tables"]["tenant_features"]["Row"] | null;
}

function isLocaleValue(value: string): value is Locale {
  return value === "pt-BR" || value === "es-419";
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profileResult = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileResult.error || !profileResult.data) {
    return null;
  }

  const profileRow = profileResult.data;

  const tenantResult = await supabase
    .from("tenants")
    .select("*")
    .eq("id", profileRow.tenant_id)
    .single();

  if (tenantResult.error || !tenantResult.data) {
    return null;
  }

  const tenantRow = tenantResult.data;

  const featuresResult = await supabase
    .from("tenant_features")
    .select("*")
    .eq("tenant_id", profileRow.tenant_id)
    .maybeSingle();

  return {
    supabase,
    userId: user.id,
    profile: {
      id: profileRow.id,
      tenantId: profileRow.tenant_id,
      fullName: profileRow.full_name,
      role: profileRow.role,
      locale: isLocaleValue(profileRow.locale) ? profileRow.locale : "pt-BR",
    },
    tenant: {
      id: tenantRow.id,
      name: tenantRow.name,
      slug: tenantRow.slug,
      locale: isLocaleValue(tenantRow.locale) ? tenantRow.locale : "pt-BR",
      currency: tenantRow.currency,
      receiptWidth: tenantRow.receipt_width === "80mm" ? "80mm" : "58mm",
      address: tenantRow.address,
      phone: tenantRow.phone,
      pixKey: tenantRow.pix_key ?? null,
      pixKeyType: tenantRow.pix_key_type ?? null,
      pixName: tenantRow.pix_name ?? null,
      pixCity: tenantRow.pix_city ?? null,
      bobQrImage: tenantRow.bob_qr_image ?? null,
    },
    features: featuresResult.data ?? null,
  };
}
