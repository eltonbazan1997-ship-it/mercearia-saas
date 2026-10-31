"use client";

import { useState } from "react";
import { getTopProductsAction } from "@/app/actions/dashboard-actions";
import type { DashboardTopProductRow } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";

export type TopProductsPeriod = "today" | "7d" | "30d";

export interface TopProductsRankingProps {
  initialProducts: DashboardTopProductRow[];
  locale: Locale;
  currency: string;
}

export function TopProductsRanking({
  initialProducts,
  locale,
  currency,
}: TopProductsRankingProps) {
  const t = getUiDictionary(locale);
  const PERIOD_TABS: { key: TopProductsPeriod; label: string }[] = [
    { key: "today", label: t.ranking.tabToday },
    { key: "7d", label: t.ranking.tab7d },
    { key: "30d", label: t.ranking.tab30d },
  ];
  const [period, setPeriod] = useState<TopProductsPeriod>("today");
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);

  async function selectPeriod(next: TopProductsPeriod) {
    if (next === period) return;
    setPeriod(next);
    setLoading(true);
    const result = await getTopProductsAction(next);
    if (result.ok) {
      setProducts(result.data);
    }
    setLoading(false);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">
          {t.ranking.title}
        </h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => void selectPeriod(tab.key)}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                period === tab.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="mt-4 text-sm text-slate-400">{t.ranking.loading}</p>
      )}

      {!loading && products.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">{t.ranking.empty}</p>
      )}

      {!loading && products.length > 0 && (
        <ol className="mt-4 divide-y divide-slate-100">
          {products.map((product, index) => (
            <li
              key={product.product_id ?? `${product.product_name}-${index}`}
              className="flex items-center gap-3 py-2.5"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  index === 0
                    ? "bg-amber-100 text-amber-700"
                    : index === 1
                      ? "bg-slate-200 text-slate-600"
                      : index === 2
                        ? "bg-orange-100 text-orange-700"
                        : "bg-slate-100 text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {product.product_name}
                </p>
                <p className="text-xs text-slate-500">
                  {t.ranking.units(product.units_sold)}
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {formatCentsAsCurrency(product.revenue_cents, locale, currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
