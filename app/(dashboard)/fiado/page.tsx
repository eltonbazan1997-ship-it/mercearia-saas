import { redirect } from "next/navigation";
import { CustomerLedgerManager } from "@/components/fiado/CustomerLedgerManager";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { CustomerRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function FiadoPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const features = normalizeFeatures(context.features);
  const t = getUiDictionary(context.tenant.locale);

  if (!features.fiado) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <h1 className="text-lg font-bold text-amber-800">
          {t.fiadoPage.disabledTitle}
        </h1>
        <p className="mt-2 text-sm text-amber-700">{t.fiadoPage.disabledBody}</p>
      </div>
    );
  }

  const customersResult = await context.supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", context.tenant.id)
    .order("full_name");

  const customers = (customersResult.data ?? []).map((row: CustomerRow) => ({
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    debtCents: row.debt_cents,
    creditLimitCents: row.credit_limit_cents,
    trustedPerson1Name: row.trusted_person_1_name,
    trustedPerson1Phone: row.trusted_person_1_phone,
    trustedPerson2Name: row.trusted_person_2_name,
    trustedPerson2Phone: row.trusted_person_2_phone,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {t.fiadoPage.title}
        </h1>
        <p className="text-sm text-slate-500">{t.fiadoPage.subtitle}</p>
      </div>

      <CustomerLedgerManager
        initialCustomers={customers}
        locale={context.tenant.locale}
        features={features}
        currency={context.tenant.currency}
        storeName={context.tenant.name}
        storeTenantId={context.tenant.id}
      />
    </div>
  );
}
