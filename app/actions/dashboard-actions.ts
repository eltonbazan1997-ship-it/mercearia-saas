"use server";

import { getSessionContext } from "@/lib/auth/session";
import type {
  DashboardAnalyticsRow,
  DashboardDailyPoint,
  DashboardPeriodRow,
  DashboardTopProductRow,
} from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/validation/schemas";

export type TopProductsPeriod = "today" | "7d" | "30d";

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toTopProduct(value: unknown): DashboardTopProductRow {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    product_id: typeof row.product_id === "string" ? row.product_id : null,
    product_name:
      typeof row.product_name === "string" ? row.product_name : "Produto",
    units_sold: toNumber(row.units_sold),
    revenue_cents: toNumber(row.revenue_cents),
  };
}

function toWeekHistory(value: unknown) {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    week_start:
      typeof row.week_start === "string" ? row.week_start : "",
    revenue_cents: toNumber(row.revenue_cents),
    orders_count: toNumber(row.orders_count),
    credit_issued_cents: toNumber(row.credit_issued_cents),
  };
}

function parseAnalytics(raw: unknown): DashboardAnalyticsRow {
  const data = (raw ?? {}) as Record<string, unknown>;
  const list = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

  return {
    today_sales_cents: toNumber(
      data.today_sales_cents ?? data.today_revenue_cents
    ),
    today_orders_count: toNumber(data.today_orders_count),
    today_credit_cents: toNumber(
      data.today_credit_cents ?? data.today_credit_issued_cents
    ),
    total_debt_cents: toNumber(
      data.total_debt_cents ?? data.total_outstanding_debt_cents
    ),
    top_products_today: list(data.top_products_today).map(toTopProduct),
    top_products_7d: list(data.top_products_7d).map(toTopProduct),
    top_products_30d: list(data.top_products_30d).map(toTopProduct),
    weekly_history_90d: list(data.weekly_history_90d).map(toWeekHistory),
  };
}

export async function getDashboardAnalyticsAction(): Promise<
  ActionResult<DashboardAnalyticsRow>
> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const { data, error } = await context.supabase.rpc(
    "get_dashboard_analytics",
    { p_tenant_id: context.tenant.id }
  );

  if (error) {
    return {
      ok: false,
      error: error.message ?? "Não foi possível carregar o painel",
      code: "load_failed",
    };
  }

  return { ok: true, data: parseAnalytics(data) };
}

export async function getTopProductsAction(
  period: TopProductsPeriod
): Promise<ActionResult<DashboardTopProductRow[]>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const { data, error } = await context.supabase.rpc(
    "get_dashboard_analytics",
    { p_tenant_id: context.tenant.id, p_period: period }
  );

  if (error) {
    return {
      ok: false,
      error: error.message ?? "Não foi possível carregar os produtos",
      code: "load_failed",
    };
  }

  const parsed = parseAnalytics(data);
  const byPeriod = {
    today: parsed.top_products_today,
    "7d": parsed.top_products_7d,
    "30d": parsed.top_products_30d,
  } as const;

  return { ok: true, data: byPeriod[period] };
}

function toDailyPoint(value: unknown): DashboardDailyPoint {
  const row = (value ?? {}) as Record<string, unknown>;
  const day =
    typeof row.day === "string"
      ? row.day
      : typeof row.date === "string"
        ? row.date
        : typeof row.week_start === "string"
          ? row.week_start
          : "";
  return {
    day,
    revenue_cents: toNumber(row.revenue_cents ?? row.sales_cents ?? row.total_cents),
    orders_count: toNumber(row.orders_count ?? row.count),
    credit_cents: toNumber(row.credit_cents ?? row.credit_issued_cents),
  };
}

function parsePeriodAnalytics(raw: unknown): DashboardPeriodRow {
  const data = (raw ?? {}) as Record<string, unknown>;
  const list = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

  return {
    period_sales_cents: toNumber(
      data.period_sales_cents ?? data.sales_cents ?? data.revenue_cents
    ),
    period_orders_count: toNumber(
      data.period_orders_count ?? data.orders_count
    ),
    period_credit_cents: toNumber(
      data.period_credit_cents ?? data.credit_cents
    ),
    compare_sales_cents: toNumber(data.compare_sales_cents),
    compare_orders_count: toNumber(data.compare_orders_count),
    total_debt_cents: toNumber(data.total_debt_cents),
    daily_timeline: list(data.daily_timeline).map(toDailyPoint),
    top_products: list(data.top_products).map(toTopProduct),
  };
}

export async function getDashboardAnalyticsByPeriodAction(input: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<DashboardPeriodRow>> {
  const context = await getSessionContext();
  if (!context) {
    return { ok: false, error: "Sessão expirada", code: "unauthorized" };
  }

  const { data, error } = await context.supabase.rpc(
    "get_dashboard_analytics_by_period",
    {
      p_tenant_id: context.tenant.id,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
    }
  );

  if (error) {
    return {
      ok: false,
      error: error.message ?? "Não foi possível carregar o período",
      code: "load_failed",
    };
  }

  return { ok: true, data: parsePeriodAnalytics(data) };
}
