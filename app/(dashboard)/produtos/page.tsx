import { redirect } from "next/navigation";
import { ProductCatalogManager } from "@/components/products/ProductCatalogManager";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeFeatures } from "@/lib/features";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { ProductCatalogItem } from "@/lib/stock-engine";
import type { ProductRow } from "@/lib/supabase/database.types";

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

export default async function ProdutosPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const productsResult = await context.supabase
    .from("products")
    .select("*")
    .eq("tenant_id", context.tenant.id)
    .order("name");

  const products = (productsResult.data ?? []).map(toCatalogItem);
  const features = normalizeFeatures(context.features);
  const t = getUiDictionary(context.tenant.locale);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {t.productsPage.title}
        </h1>
        <p className="text-sm text-slate-500">{t.productsPage.subtitle}</p>
      </div>

      <ProductCatalogManager
        initialProducts={products}
        features={features}
        locale={context.tenant.locale}
        currency={context.tenant.currency}
      />
    </div>
  );
}
