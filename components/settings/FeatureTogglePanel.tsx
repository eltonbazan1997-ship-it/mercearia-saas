"use client";

import { useCallback, useState } from "react";
import { setTenantFeatureAction } from "@/app/actions/feature-actions";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import {
  DEFAULT_TENANT_FEATURES,
  type FeatureKey,
  type TenantFeatures,
} from "@/lib/features";

export interface FeatureTogglePanelProps {
  initialFeatures: TenantFeatures;
  locale: Locale;
}

const FEATURE_KEYS: FeatureKey[] = [
  "fiado",
  "whatsapp",
  "thermal_printer",
  "pos_sounds",
  "stock_block",
  "price_calculator",
];

export function FeatureTogglePanel({
  initialFeatures,
  locale,
}: FeatureTogglePanelProps) {
  const t = getUiDictionary(locale);
  const [features, setFeatures] = useState<TenantFeatures>(
    initialFeatures ?? DEFAULT_TENANT_FEATURES
  );
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const toggle = useCallback(
    async (key: FeatureKey, enabled: boolean) => {
      setSavingKey(key);
      setMessage(null);
      const previous = features;
      setFeatures((current) => ({ ...current, [key]: enabled }));

      try {
        const result = await setTenantFeatureAction({ key, enabled });
        if (!result.ok) {
          setFeatures(previous);
          setMessage({ tone: "error", text: result.error });
          return;
        }
        setFeatures(result.data);
        setMessage({
          tone: "success",
          text: t.features.toggled(t.features.meta[key].title, enabled),
        });
      } catch {
        setFeatures(previous);
        setMessage({ tone: "error", text: t.features.unexpectedFail });
      } finally {
        setSavingKey(null);
      }
    },
    [features, t]
  );

  return (
    <div className="no-print space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {t.features.title}
          </h2>
          <p className="text-sm text-slate-500">{t.features.subtitle}</p>
        </div>
        {message ? (
          <span
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              message.tone === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
            role="status"
          >
            {message.text}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {FEATURE_KEYS.map((key) => {
          const meta = t.features.meta[key];
          const enabled = features[key];
          const saving = savingKey === key;
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 transition ${
                enabled
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{meta.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {meta.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={meta.title}
                  disabled={saving}
                  onClick={() => void toggle(key, !enabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition disabled:cursor-wait disabled:opacity-60 ${
                    enabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                    style={{ marginTop: 2 }}
                  />
                </button>
              </div>
              <p
                className={`mt-3 text-xs font-semibold ${
                  enabled ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {saving
                  ? t.features.saving
                  : enabled
                    ? t.features.enabled
                    : t.features.disabled}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
