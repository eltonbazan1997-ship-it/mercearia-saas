"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProductAction } from "@/app/actions/product-actions";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModalLazy";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { TenantFeatures } from "@/lib/features";
import {
  analyzeSalePrice,
  calculateIntelligentPrice,
  formatCentsAsCurrency,
  PricingCalculationError,
  resolveCurrencySymbol,
} from "@/lib/pricing-calculator";
import type { ProductCatalogItem } from "@/lib/stock-engine";

export interface ProductCreationModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (product: ProductCatalogItem) => void;
  features: TenantFeatures;
  locale: Locale;
  currency: string;
}

function parseReaisToCents(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

interface FormState {
  name: string;
  barcode: string;
  category: string;
  unit: string;
  costPrice: string;
  salePrice: string;
  creditPrice: string;
  stockQuantity: string;
  minStockAlert: string;
  expiresOn: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  barcode: "",
  category: "geral",
  unit: "un",
  costPrice: "",
  salePrice: "",
  creditPrice: "",
  stockQuantity: "0",
  minStockAlert: "5",
  expiresOn: "",
};

export function ProductCreationModal({
  open,
  onClose,
  onCreated,
  features,
  locale,
  currency,
}: ProductCreationModalProps) {
  const t = getUiDictionary(locale);
  const symbol = resolveCurrencySymbol(currency);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [desiredMargin, setDesiredMargin] = useState("30");
  const [cardFee, setCardFee] = useState("3");
  const [breakage, setBreakage] = useState("2");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const money = useCallback(
    (cents: number) => formatCentsAsCurrency(cents, locale, currency),
    [currency, locale]
  );

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setFieldErrors({});
      setFormError(null);
      setSavedFeedback(null);
      const timer = setTimeout(() => barcodeRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const costCents = useMemo(() => parseReaisToCents(form.costPrice), [form.costPrice]);
  const saleCents = useMemo(() => parseReaisToCents(form.salePrice), [form.salePrice]);

  const suggestion = useMemo(() => {
    if (!features.price_calculator || costCents == null || costCents <= 0) {
      return null;
    }
    try {
      const margin = Number(desiredMargin.replace(",", "."));
      const card = Number(cardFee.replace(",", "."));
      const operational = Number(breakage.replace(",", "."));
      if (!Number.isFinite(margin)) {
        return null;
      }
      const result = calculateIntelligentPrice({
        costPriceCents: costCents,
        desiredMarginPercent: margin,
        cardFeePercent: Number.isFinite(card) ? card : 0,
        operationalBreakagePercent: Number.isFinite(operational) ? operational : 0,
        roundingStepCents: 1,
      });
      return { ok: true as const, result };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof PricingCalculationError
            ? error.message
            : t.productModal.calcError,
      };
    }
  }, [breakage, cardFee, costCents, desiredMargin, features.price_calculator, t]);

  const analysis = useMemo(() => {
    if (costCents == null || saleCents == null || costCents <= 0 || saleCents <= 0) {
      return null;
    }
    const card = Number(cardFee.replace(",", "."));
    const operational = Number(breakage.replace(",", "."));
    return analyzeSalePrice({
      costPriceCents: costCents,
      salePriceCents: saleCents,
      cardFeePercent: Number.isFinite(card) ? card : 0,
      operationalBreakagePercent: Number.isFinite(operational) ? operational : 0,
    });
  }, [breakage, cardFee, costCents, saleCents]);

  const updateField = useCallback((key: keyof FormState, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSavedFeedback(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) {
        return;
      }

      setFieldErrors({});
      setFormError(null);

      const payload = {
        name: form.name.trim(),
        barcode: form.barcode.trim() ? form.barcode.trim() : null,
        category: form.category.trim(),
        unit: form.unit.trim() || "un",
        costPriceCents: costCents ?? 0,
        salePriceCents: saleCents ?? 0,
        creditPriceCents: parseReaisToCents(form.creditPrice) ?? saleCents ?? 0,
        stockQuantity: Number.parseInt(form.stockQuantity, 10) || 0,
        minStockAlert: Number.parseInt(form.minStockAlert, 10) || 0,
        expiresOn: form.expiresOn ? form.expiresOn : null,
      };

      setSaving(true);
      try {
        const result = await createProductAction(payload);
        if (!result.ok) {
          setFormError(result.error);
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
          return;
        }
        setSavedFeedback(t.productModal.createdFeedback(result.data.name));
        onCreated?.(result.data);
        setForm(INITIAL_FORM);
        barcodeRef.current?.focus();
      } catch {
        setFormError(t.productModal.saveFailed);
      } finally {
        setSaving(false);
      }
    },
    [costCents, form, onCreated, saleCents, saving, t]
  );

  if (!open) {
    return null;
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm";
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.productModal.createAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="my-auto flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {t.productModal.createTitle}
            </h2>
            <p className="text-xs text-slate-500">
              {t.productModal.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            aria-label={t.productModal.close}
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 pb-8 md:grid-cols-2" data-modal-body>
          <div className="space-y-4">
            <div>
              <label htmlFor="product-barcode" className={labelClass}>
                {t.productModal.barcodeLabel}
              </label>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  id="product-barcode"
                  ref={barcodeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.barcode}
                  onChange={(event) =>
                    updateField("barcode", event.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t.productModal.barcodePlaceholder}
                  className={`${inputClass} min-w-0 flex-1 font-mono tracking-widest`}
                />
                <button
                  type="button"
                  onClick={() => setScanOpen(true)}
                  className="flex w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-lg text-slate-700 transition hover:border-blue-400 hover:text-blue-600"
                  title={t.pos.camera}
                  aria-label={t.pos.cameraAria}
                >
                  📷
                </button>
              </div>
              {fieldErrors.barcode ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.barcode[0]}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="product-name" className={labelClass}>
                {t.productModal.nameLabel}
              </label>
              <input
                id="product-name"
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder={t.productModal.namePlaceholder}
                className={`${inputClass} mt-1`}
              />
              {fieldErrors.name ? (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.name[0]}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="product-category" className={labelClass}>
                  {t.productModal.categoryLabel}
                </label>
                <input
                  id="product-category"
                  type="text"
                  value={form.category}
                  onChange={(event) => updateField("category", event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label htmlFor="product-unit" className={labelClass}>
                  {t.productModal.unitLabel}
                </label>
                <input
                  id="product-unit"
                  type="text"
                  value={form.unit}
                  onChange={(event) => updateField("unit", event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="product-cost" className={labelClass}>
                  {t.productModal.costLabel(symbol)}
                </label>
                <input
                  id="product-cost"
                  type="text"
                  inputMode="decimal"
                  value={form.costPrice}
                  onChange={(event) => updateField("costPrice", event.target.value)}
                  placeholder="0,00"
                  className={`${inputClass} mt-1`}
                />
                {fieldErrors.costPriceCents ? (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.costPriceCents[0]}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="product-sale" className={labelClass}>
                  {t.productModal.saleLabel(symbol)}
                </label>
                <input
                  id="product-sale"
                  type="text"
                  inputMode="decimal"
                  value={form.salePrice}
                  onChange={(event) => updateField("salePrice", event.target.value)}
                  placeholder="0,00"
                  className={`${inputClass} mt-1`}
                />
                {fieldErrors.salePriceCents ? (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.salePriceCents[0]}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="product-credit" className={labelClass}>
                  {t.productModal.creditPriceLabel(symbol)}
                </label>
                <input
                  id="product-credit"
                  type="text"
                  inputMode="decimal"
                  value={form.creditPrice}
                  onChange={(event) => updateField("creditPrice", event.target.value)}
                  placeholder="0,00"
                  className={`${inputClass} mt-1`}
                />
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {t.productModal.creditPriceHint}
                </p>
                {fieldErrors.creditPriceCents ? (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.creditPriceCents[0]}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex w-full flex-col gap-1">
                <label htmlFor="product-expires" className={labelClass}>
                  {t.productModal.expiryLabel}
                </label>
                <input
                  id="product-expires"
                  type="date"
                  value={form.expiresOn}
                  onChange={(event) => updateField("expiresOn", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex w-full flex-col gap-1">
                <label htmlFor="product-stock" className={labelClass}>
                  {t.productModal.stockLabel}
                </label>
                <input
                  id="product-stock"
                  type="number"
                  value={form.stockQuantity}
                  onChange={(event) => updateField("stockQuantity", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex w-full flex-col gap-1">
                <label htmlFor="product-min-stock" className={labelClass}>
                  {t.productModal.minStockLabel}
                </label>
                <input
                  id="product-min-stock"
                  type="number"
                  value={form.minStockAlert}
                  onChange={(event) => updateField("minStockAlert", event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {features.price_calculator ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {t.productModal.calcTitle}
                </h3>
                <div className="mt-3 grid w-full min-w-0 grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label htmlFor="calc-margin" className="text-[11px] text-slate-500">
                      {t.productModal.calcMargin}
                    </label>
                    <input
                      id="calc-margin"
                      type="text"
                      inputMode="decimal"
                      value={desiredMargin}
                      onChange={(event) => setDesiredMargin(event.target.value)}
                      className={`${inputClass} mt-1 text-center text-sm`}
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="calc-card" className="text-[11px] text-slate-500">
                      {t.productModal.calcCard}
                    </label>
                    <input
                      id="calc-card"
                      type="text"
                      inputMode="decimal"
                      value={cardFee}
                      onChange={(event) => setCardFee(event.target.value)}
                      className={`${inputClass} mt-1 text-center text-sm`}
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="calc-breakage" className="text-[11px] text-slate-500">
                      {t.productModal.calcBreakage}
                    </label>
                    <input
                      id="calc-breakage"
                      type="text"
                      inputMode="decimal"
                      value={breakage}
                      onChange={(event) => setBreakage(event.target.value)}
                      className={`${inputClass} mt-1 text-center text-sm`}
                    />
                  </div>
                </div>

                {suggestion?.ok === false ? (
                  <p className="mt-3 text-xs font-medium text-red-600">
                    {suggestion.message}
                  </p>
                ) : null}

                {suggestion?.ok === true ? (
                  <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span>{t.productModal.suggestedPrice}</span>
                      <span className="text-sm font-bold text-blue-700 tabular-nums">
                        {money(suggestion.result.suggestedSalePriceCents)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>{t.productModal.grossProfit}</span>
                      <span className="tabular-nums">
                        {money(suggestion.result.grossProfitCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t.productModal.deductions}</span>
                      <span className="tabular-nums text-orange-600">
                        −{money(suggestion.result.deductions.totalDeductionCents)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1">
                      <span>{t.productModal.netMarginReal}</span>
                      <span className="font-semibold tabular-nums text-emerald-700">
                        {money(suggestion.result.netMarginCents)} (
                        {suggestion.result.netMarginPercent}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "salePrice",
                          (suggestion.result.suggestedSalePriceCents / 100)
                            .toFixed(2)
                            .replace(".", ",")
                        )
                      }
                      className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      {t.productModal.applySuggested}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {analysis ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.productModal.analysisTitle}
                </h3>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <dt>{t.productModal.grossProfit}</dt>
                    <dd className="tabular-nums">{money(analysis.grossProfitCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.productModal.cardFee}</dt>
                    <dd className="tabular-nums text-orange-600">
                      −{money(analysis.cardFeeCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.productModal.operationalBreakage}</dt>
                    <dd className="tabular-nums text-orange-600">
                      −{money(analysis.operationalBreakageCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                    <dt>{t.productModal.netMargin}</dt>
                    <dd
                      className={`tabular-nums ${
                        analysis.netMarginCents >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {money(analysis.netMarginCents)} ({analysis.netMarginPercent}%)
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.productModal.markupOnCost}</dt>
                    <dd className="tabular-nums">{analysis.markupOnCostPercent}%</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.productModal.summaryTitle}
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                <li className="flex justify-between">
                  <span>{t.productModal.summaryCost}</span>
                  <span className="tabular-nums">
                    {costCents != null ? money(costCents) : "—"}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>{t.productModal.summarySalePrice}</span>
                  <span className="tabular-nums">
                    {saleCents != null ? money(saleCents) : "—"}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {formError ? (
          <p className="mx-6 mb-2 shrink-0 rounded-lg bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        {savedFeedback ? (
          <p className="mx-6 mb-2 shrink-0 rounded-lg bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
            {savedFeedback}
          </p>
        ) : null}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {t.productModal.close}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? t.productModal.saving : t.productModal.saveCreate}
          </button>
        </div>
      </form>

      <BarcodeScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(code) => updateField("barcode", code.replace(/\D/g, ""))}
        locale={locale}
      />
    </div>
  );
}
