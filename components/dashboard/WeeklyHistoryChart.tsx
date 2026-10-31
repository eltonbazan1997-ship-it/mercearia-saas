import type { DashboardWeekHistoryRow } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";

export interface WeeklyHistoryChartProps {
  weeks: DashboardWeekHistoryRow[];
  locale: Locale;
  currency: string;
}

interface MonthlyAgg {
  key: string;
  label: string;
  revenueCents: number;
  ordersCount: number;
  creditIssuedCents: number;
}

const MONTH_LABELS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const MONTH_LABELS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function weekLabel(weekStart: string): string {
  if (!weekStart) return "";
  const parts = weekStart.split("-");
  if (parts.length < 3) return weekStart;
  return `${parts[2]}/${parts[1]}`;
}

function aggregateByMonth(
  weeks: DashboardWeekHistoryRow[]
): MonthlyAgg[] {
  const map = new Map<string, MonthlyAgg>();
  for (const week of weeks) {
    if (!week.week_start) continue;
    const key = week.week_start.slice(0, 7);
    if (!map.has(key)) {
      const monthIndex = Number(key.slice(5, 7)) - 1;
      map.set(key, {
        key,
        label: key,
        revenueCents: 0,
        ordersCount: 0,
        creditIssuedCents: 0,
      });
      void monthIndex;
    }
    const agg = map.get(key)!;
    agg.revenueCents += week.revenue_cents;
    agg.ordersCount += week.orders_count;
    agg.creditIssuedCents += week.credit_issued_cents;
  }
  return Array.from(map.values());
}

export function WeeklyHistoryChart({
  weeks,
  locale,
  currency,
}: WeeklyHistoryChartProps) {
  const t = getUiDictionary(locale);
  const monthly = aggregateByMonth(weeks);
  const maxWeekly = Math.max(1, ...weeks.map((w) => w.revenue_cents));
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.revenueCents));
  const monthLabels = locale === "es-419" ? MONTH_LABELS_ES : MONTH_LABELS_PT;

  function monthDisplay(key: string): string {
    const monthIndex = Number(key.slice(5, 7)) - 1;
    const year = key.slice(2, 4);
    const label = monthLabels[monthIndex] ?? key;
    return `${label}/${year}`;
  }

  if (weeks.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">
          {t.chart.title}
        </h2>
        <p className="mt-3 text-sm text-slate-400">{t.chart.empty}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800">
        {t.chart.title}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {t.chart.subtitle(weeks.length)}
      </p>

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t.chart.weeklyTitle}
        </h3>
        <div className="mt-3 flex h-36 items-end gap-1.5">
          {weeks.map((week) => {
            const height = Math.max(
              4,
              Math.round((week.revenue_cents / maxWeekly) * 100)
            );
            return (
              <div
                key={week.week_start || week.revenue_cents.toString()}
                className="group relative flex-1"
                title={t.chart.barTitle(
                  weekLabel(week.week_start),
                  formatCentsAsCurrency(week.revenue_cents, locale, currency),
                  String(week.orders_count)
                )}
              >
                <div
                  className="rounded-t bg-slate-800 transition group-hover:bg-slate-600"
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{weekLabel(weeks[0]?.week_start ?? "")}</span>
          <span>
            {weekLabel(weeks[weeks.length - 1]?.week_start ?? "")}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t.chart.monthlyTitle}
        </h3>
        <ul className="mt-3 space-y-2">
          {monthly.map((month) => (
            <li
              key={month.key}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">
                  {monthDisplay(month.key)}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {formatCentsAsCurrency(
                    month.revenueCents,
                    locale,
                    currency
                  )}
                </span>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-slate-500">
                <span>{t.chart.orders(month.ordersCount)}</span>
                <span>
                  {t.chart.creditLabel}{" "}
                  {formatCentsAsCurrency(
                    month.creditIssuedCents,
                    locale,
                    currency
                  )}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-800"
                  style={{
                    width: `${Math.max(
                      2,
                      Math.round((month.revenueCents / maxMonthly) * 100)
                    )}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
