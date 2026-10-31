import { redirect } from "next/navigation";
import { POSTerminalWithDispatch } from "@/components/pos/POSTerminalWithDispatch";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { ProductCatalogItem } from "@/lib/stock-engine";
import type { ProductRow, CustomerRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

function toCatalogItem(row: ProductRow): ProductCatalogItem {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    category: row.category,
    unit: row.unit,
    costPriceCents: row.cost_price_cents,
    salePriceCents: row.sale_price_cents,
    creditPriceCents: row.credit_price_cents,
    stockQuantity: row.stock_quantity,
    minStockAlert: row.min_stock_alert,
    expiresOn: row.expires_on,
    isActive: row.is_active,
  };
}

export default async function PdvPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const features = normalizeFeatures(context.features);
  const t = getUiDictionary(context.tenant.locale);

  const [productsResult, customersResult] = await Promise.all([
    context.supabase
      .from("products")
      .select("*")
      .eq("tenant_id", context.tenant.id)
      .eq("is_active", true)
      .order("name"),
    context.supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", context.tenant.id)
      .order("full_name"),
  ]);

  const products = (productsResult.data ?? []).map(toCatalogItem);
  const customers = (customersResult.data ?? []).map((row: CustomerRow) => ({
    id: row.id,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    debtCents: row.debt_cents,
    creditLimitCents: row.credit_limit_cents,
    trustedPerson1Name: row.trusted_person_1_name,
    trustedPerson2Name: row.trusted_person_2_name,
  }));

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3.5 pb-28 pt-2 box-border flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t.pdv.title}</h1>
          <p className="text-sm text-slate-500">{t.pdv.subtitle}</p>
        </div>
        <div className="flex w-full flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
            {t.pdv.stockBlock(features.stock_block ? "on" : "off")}
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-200">
            {t.pdv.whatsapp(features.whatsapp ? "on" : "off")}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
            {t.pdv.credit(features.fiado ? "on" : "off")}
          </span>
        </div>
      </div>

      <POSTerminalWithDispatch
        products={products}
        customers={customers}
        features={features}
        locale={context.tenant.locale}
        currency={context.tenant.currency}
        operatorName={context.profile.fullName}
        tenantPixKey={context.tenant.pixKey}
        tenantPixName={context.tenant.pixName}
        tenantPixCity={context.tenant.pixCity}
        tenantBobQrImage={context.tenant.bobQrImage}
      />
    </div>
  );
}
