import Link from "next/link";
import { redirect } from "next/navigation";
import { TopProductsRanking } from "@/components/dashboard/TopProductsRanking";
import { WeeklyHistoryChart } from "@/components/dashboard/WeeklyHistoryChart";
import { DashboardPeriodContainer } from "@/components/dashboard/DashboardPeriodContainer";
import { RefreshDashboardButton } from "@/components/dashboard/RefreshDashboardButton";
import { getDashboardAnalyticsAction } from "@/app/actions/dashboard-actions";
import { getSessionContext } from "@/lib/auth/session";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface KpiCard {
  label: string;
  value: string;
  hint: string;
  accent: string;
}

export default async function DashboardPage() {
  const context = await getSessionContext();
  if (!context) {
    redirect("/login");
  }

  const analyticsResult = await getDashboardAnalyticsAction();
  const locale = context.tenant.locale;
  const currency = context.tenant.currency;
  const t = getUiDictionary(locale);

  const analytics = analyticsResult.ok
    ? analyticsResult.data
    : {
        today_sales_cents: 0,
        today_orders_count: 0,
        today_credit_cents: 0,
        total_debt_cents: 0,
        top_products_today: [],
        top_products_7d: [],
        top_products_30d: [],
        weekly_history_90d: [],
      };

  const cashRevenueToday = Math.max(analytics.today_sales_cents - analytics.today_credit_cents, 0);

  const cards: KpiCard[] = [
    {
      label: locale === "es-419" ? "Entradas en Caja (Efectivo/Pix)" : "Entradas em Caixa (À Vista/Pix)",
      value: formatCentsAsCurrency(
        cashRevenueToday,
        locale,
        currency
      ),
      hint: locale === "es-419" ? "Ventas pagadas de contado o Pix hoy" : "Vendas pagas à vista ou Pix hoje",
      accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
    {
      label: locale === "es-419" ? "Ventas a Plazo (Fiado)" : "Vendas a Prazo (Fiado)",
      value: formatCentsAsCurrency(
        analytics.today_credit_cents,
        locale,
        currency
      ),
      hint: locale === "es-419" ? "Crédito generado en ventas a fiado hoy" : "Crédito gerado em vendas no fiado hoje",
      accent: "bg-amber-50 text-amber-700 border-amber-100",
    },
    {
      label: t.dashboard.cards.orders.label,
      value: String(analytics.today_orders_count),
      hint: t.dashboard.cards.orders.hint,
      accent: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      label: t.dashboard.cards.debt.label,
      value: formatCentsAsCurrency(
        analytics.total_debt_cents,
        locale,
        currency
      ),
      hint: t.dashboard.cards.debt.hint,
      accent: "bg-rose-50 text-rose-700 border-rose-100",
    },
  ];

  return (
    <div className="max-w-full overflow-x-hidden space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {t.dashboard.title}
          </h1>
          <p className="text-sm text-slate-500">
            {t.dashboard.subtitle(context.tenant.name, currency)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshDashboardButton label={t.dashboard.refresh} />
          <Link
            href="/pdv"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {t.dashboard.openRegister}
          </Link>
        </div>
      </div>

      {!analyticsResult.ok && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {analyticsResult.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border p-5 shadow-sm ${card.accent}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs opacity-70">{card.hint}</p>
          </div>
        ))}
      </div>

      <DashboardPeriodContainer
        locale={locale}
        currency={currency}
        storeName={context.tenant.name}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <WeeklyHistoryChart
          weeks={analytics.weekly_history_90d}
          locale={locale}
          currency={currency}
        />
      </div>
    </div>
  );
}
