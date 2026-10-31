import { redirect } from "next/navigation";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { FeatureTogglePanel } from "@/components/settings/FeatureTogglePanel";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const features = normalizeFeatures(context.features);
  const readOnly = context.profile.role === "cashier";
  const t = getUiDictionary(context.tenant.locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {t.settingsPage.title}
        </h1>
        <p className="text-sm text-slate-500">{t.settingsPage.subtitle}</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">
          {t.settingsPage.profileTitle}
        </h2>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>
            {t.settingsPage.rollWidth(context.tenant.receiptWidth)}
          </span>
        </div>
        <CompanyProfileForm
          initialName={context.tenant.name}
          initialCurrency={context.tenant.currency}
          initialLocale={context.tenant.locale}
          initialPhone={context.tenant.phone}
          initialAddress={context.tenant.address}
          initialPixKey={context.tenant.pixKey}
          initialPixKeyType={context.tenant.pixKeyType}
          initialPixName={context.tenant.pixName}
          initialPixCity={context.tenant.pixCity}
          initialBobQrImage={context.tenant.bobQrImage}
          readOnly={readOnly}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <FeatureTogglePanel
          initialFeatures={features}
          locale={context.tenant.locale}
        />
      </section>
    </div>
  );
}
