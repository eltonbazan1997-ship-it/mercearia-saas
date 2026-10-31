"use client";

import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { StockStatusLevel } from "@/lib/stock-engine";

export interface StockBadgeProps {
  status: StockStatusLevel;
  remaining: number;
  unit?: string;
  minStockAlert?: number;
  compact?: boolean;
  className?: string;
  locale?: Locale;
}

const STATUS_STYLES: Record<
  StockStatusLevel,
  { container: string; dot: string; pulse: boolean }
> = {
  GREEN: {
    container: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    pulse: false,
  },
  ORANGE: {
    container: "bg-orange-50 text-orange-700 ring-orange-200",
    dot: "bg-orange-500",
    pulse: false,
  },
  RED: {
    container: "bg-red-50 text-red-700 ring-red-300",
    dot: "bg-red-600",
    pulse: true,
  },
};

export function StockBadge({
  status,
  remaining,
  unit = "un",
  minStockAlert,
  compact = false,
  className = "",
  locale = "pt-BR",
}: StockBadgeProps) {
  const t = getUiDictionary(locale);
  const style = STATUS_STYLES[status];
  const displayQuantity = Math.max(remaining, 0);
  const quantityLabel =
    status === "RED" ? `${Math.min(remaining, 0)}` : String(displayQuantity);
  const statusText =
    status === "GREEN"
      ? t.stockBadge.healthy
      : status === "ORANGE"
        ? t.stockBadge.attention
        : t.stockBadge.out;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${style.container} ${className}`}
      >
        <span
          className={`h-2 w-2 rounded-full ${style.dot} ${style.pulse ? "animate-stock-pulse" : ""}`}
        />
        {quantityLabel}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${style.container} ${className}`}
      title={
        minStockAlert != null
          ? t.stockBadge.minStock(minStockAlert, unit)
          : undefined
      }
    >
      <span className="flex items-center gap-1.5">
        <span
          className={`h-2.5 w-2.5 rounded-full ${style.dot} ${style.pulse ? "animate-stock-pulse" : ""}`}
        />
        <span
          className={`tabular-nums ${style.pulse ? "animate-stock-pulse" : ""}`}
        >
          {quantityLabel}
        </span>
      </span>
      <span className="font-medium">
        {unit} · {statusText}
      </span>
    </span>
  );
}
