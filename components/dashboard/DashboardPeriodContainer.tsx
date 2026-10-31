"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboardAnalyticsByPeriodAction } from "@/app/actions/dashboard-actions";
import type { DashboardPeriodRow, DashboardDailyPoint } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";
import { TopProductsRanking } from "@/components/dashboard/TopProductsRanking";

export interface DashboardPeriodContainerProps {
  locale: Locale;
  currency: string;
  storeName: string;
}

type PresetKey = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetDates(preset: PresetKey): { startDate: string; endDate: string } {
  const now = new Date();
  const today = formatDateString(now);

  if (preset === "today") {
    return { startDate: today, endDate: today };
  }
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = formatDateString(y);
    return { startDate: yStr, endDate: yStr };
  }
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { startDate: formatDateString(start), endDate: today };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { startDate: formatDateString(start), endDate: today };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatDateString(start), endDate: today };
  }
  return { startDate: today, endDate: today };
}

export function DashboardPeriodContainer({
  locale,
  currency,
  storeName,
}: DashboardPeriodContainerProps) {
  const t = getUiDictionary(locale).dashboard.period;
  const [preset, setPreset] = useState<PresetKey>("today");
  const [startDate, setStartDate] = useState(() => getPresetDates("today").startDate);
  const [endDate, setEndDate] = useState(() => getPresetDates("today").endDate);
  const [compare, setCompare] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPeriodRow | null>(null);

  const handlePresetChange = (p: PresetKey) => {
    setPreset(p);
    if (p !== "custom") {
      const range = getPresetDates(p);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  const fetchPeriod = useCallback(async () => {
    if (startDate > endDate) {
      setError(t.invalidRange);
      return;
    }
    setError(null);
    setLoading(true);
    const result = await getDashboardAnalyticsByPeriodAction({ startDate, endDate });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, [endDate, startDate, t.invalidRange]);

  useEffect(() => {
    void fetchPeriod();
  }, [fetchPeriod]);

  const money = (cents: number) => formatCentsAsCurrency(cents, locale, currency);

  const salesVariance = useMemo(() => {
    if (!data || data.compare_sales_cents <= 0) return null;
    const diff = data.period_sales_cents - data.compare_sales_cents;
    return (diff / data.compare_sales_cents) * 100;
  }, [data]);

  const periodCashRevenue = Math.max(data ? data.period_sales_cents - data.period_credit_cents : 0, 0);
  const compareCashRevenue = Math.max(data ? data.compare_sales_cents - data.period_credit_cents : 0, 0); // approx or from compare_sales

  return (
    <div className="max-w-full overflow-x-hidden space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{t.title}</h2>
            <p className="text-xs text-slate-500">{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: "today", label: t.presetToday },
                { key: "yesterday", label: t.presetYesterday },
                { key: "7d", label: t.preset7d },
                { key: "30d", label: t.preset30d },
                { key: "month", label: t.presetMonth },
                { key: "custom", label: t.presetCustom },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handlePresetChange(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  preset === item.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-medium text-slate-500">{t.startLabel}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-base text-slate-800 md:text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500">{t.endLabel}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-base text-slate-800 md:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchPeriod()}
              className="self-end rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {t.apply}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <input
            id="compare-toggle"
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <label htmlFor="compare-toggle" className="text-xs font-medium text-slate-700">
            {t.compare}
          </label>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
      </div>

      {loading && !data ? (
        <div className="py-12 text-center text-sm text-slate-400">{t.loading}</div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 opacity-80">
                {locale === "es-419" ? "Entradas en Caja (Efectivo/Pix)" : "Entradas em Caixa (À Vista/Pix)"}
              </p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                {money(periodCashRevenue)}
              </p>
              {compare && (
                <div className="mt-2 text-xs text-emerald-800">
                  {data.compare_sales_cents > 0 ? (
                    <>
                      <div>{t.previousSales(money(compareCashRevenue))}</div>
                      {salesVariance != null && (
                        <div className={`font-semibold ${salesVariance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {t.variance(salesVariance)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div>{t.noComparison}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 opacity-80">
                {locale === "es-419" ? "Ventas a Plazo (Fiado)" : "Vendas a Prazo (Fiado)"}
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-900">{money(data.period_credit_cents)}</p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 opacity-80">
                {t.orders}
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-900">{data.period_orders_count}</p>
              {compare && (
                <div className="mt-2 text-xs text-blue-800">
                  {data.compare_orders_count > 0 ? (
                    <div>{t.previousOrders(data.compare_orders_count)}</div>
                  ) : (
                    <div>{t.noComparison}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 opacity-80">
                {t.debt}
              </p>
              <p className="mt-2 text-2xl font-bold text-rose-900">{money(data.total_debt_cents)}</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">{t.dailyTitle}</h3>
              <div className="mt-4 max-h-[300px] overflow-auto">
                {data.daily_timeline.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">{t.dailyEmpty}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2 text-right">Pedidos</th>
                        <th className="px-3 py-2 text-right">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.daily_timeline.map((point: DashboardDailyPoint) => (
                        <tr key={point.day}>
                          <td className="px-3 py-2 font-medium text-slate-800">{point.day}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{point.orders_count}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">
                            {money(point.revenue_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <TopProductsRanking
              initialProducts={data.top_products}
              locale={locale}
              currency={currency}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
