"use client";

import { useCallback, useMemo, useState } from "react";
import { deleteProductAction, deleteProductsBatchAction, toggleProductActiveAction } from "@/app/actions/product-actions";
import { ProductCreationModal } from "@/components/products/ProductCreationModal";
import { ProductEditModal } from "@/components/products/ProductEditModal";
import { StockBadge } from "@/components/pos/StockBadge";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModalLazy";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { TenantFeatures } from "@/lib/features";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";
import {
  evaluateStockLevel,
  type ProductCatalogItem,
} from "@/lib/stock-engine";

export interface ProductCatalogManagerProps {
  initialProducts: ProductCatalogItem[];
  features: TenantFeatures;
  locale: Locale;
  currency: string;
}

export function ProductCatalogManager({
  initialProducts,
  features,
  locale,
  currency,
}: ProductCatalogManagerProps) {
  const t = getUiDictionary(locale);
  const [products, setProducts] = useState<ProductCatalogItem[]>(initialProducts);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductCatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(
    null
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);

  useBarcodeScanner({
    onScan: (barcode) => {
      setSearch(barcode);
    },
    enabled: true,
  });

  const handleDelete = useCallback(async (product: ProductCatalogItem) => {
    if (!window.confirm(`Deseja excluir "${product.name}"?`)) {
      return;
    }
    setBusyId(product.id);
    const res = await deleteProductAction(product.id);
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    setSelectedIds((prev) => prev.filter((id) => id !== product.id));
    setToast({ tone: "success", message: `Produto excluído com sucesso` });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Deseja excluir ${selectedIds.length} produtos selecionados?`)) {
      return;
    }
    const res = await deleteProductsBatchAction(selectedIds);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setProducts((prev) => prev.filter((p) => !selectedIds.includes(p.id)));
    setSelectedIds([]);
    setToast({ tone: "success", message: `${selectedIds.length} produtos excluídos` });
    setTimeout(() => setToast(null), 3000);
  }, [selectedIds]);

  const money = useCallback(
    (cents: number) => formatCentsAsCurrency(cents, locale, currency),
    [currency, locale]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.barcode ?? "").includes(term) ||
        product.category.toLowerCase().includes(term)
    );
  }, [products, search]);

  const allSelected =
    filtered.length > 0 && filtered.every((product) => selectedIds.includes(product.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((previous) => {
      if (filtered.every((product) => previous.includes(product.id))) {
        return previous.filter((id) => !filtered.some((product) => product.id === id));
      }
      const merged = new Set(previous);
      filtered.forEach((product) => merged.add(product.id));
      return Array.from(merged);
    });
  }, [filtered]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }, []);

  const toggleActive = useCallback(
    async (product: ProductCatalogItem) => {
      setBusyId(product.id);
      setToast(null);
      try {
        const next = !product.isActive;
        const result = await toggleProductActiveAction(product.id, next);
        if (!result.ok) {
          setToast({ tone: "error", message: result.error });
          return;
        }
        setProducts((previous) =>
          previous.map((item) => (item.id === result.data.id ? result.data : item))
        );
        setToast({
          tone: "success",
          message: next
            ? t.catalog.activated(result.data.name)
            : t.catalog.deactivated(result.data.name),
        });
      } finally {
        setBusyId(null);
        setTimeout(() => setToast(null), 3000);
      }
    },
    [t]
  );

  const handleUpdated = useCallback((product: ProductCatalogItem) => {
    setProducts((previous) =>
      previous.map((item) => (item.id === product.id ? product : item))
    );
    setEditingProduct(null);
    setToast({ tone: "success", message: t.catalog.productUpdated });
    setTimeout(() => setToast(null), 3000);
  }, [t]);

  return (
    <div className="no-print space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full max-w-md items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.catalog.searchPlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm"
          />
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            title={t.catalog.scanAria}
            aria-label={t.catalog.scanAria}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            📷
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleBatchDelete()}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              {t.catalog.deleteSelected} ({selectedIds.length})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t.catalog.newProduct}
          </button>
        </div>
      </div>

      {toast ? (
        <div
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            toast.tone === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label={t.catalog.selectAll}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3 font-semibold">{t.catalog.thProduct}</th>
              <th className="px-4 py-3 font-semibold">{t.catalog.thBarcode}</th>
              <th className="px-4 py-3 font-semibold">{t.catalog.thPrice}</th>
              <th className="px-4 py-3 font-semibold">{t.catalog.thStock}</th>
              <th className="px-4 py-3 font-semibold">{t.catalog.thStatus}</th>
              <th className="px-4 py-3 text-right font-semibold">
                {t.catalog.thActions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((product) => {
              const evaluation = evaluateStockLevel(
                product.stockQuantity,
                0,
                product.minStockAlert
              );
              return (
                <tr
                  key={product.id}
                  className={product.isActive ? "" : "opacity-50"}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      aria-label={product.name}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-400">
                      {product.category} · {product.unit}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {product.barcode ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold tabular-nums">
                      {money(product.salePriceCents)}
                    </p>
                    <p className="text-xs tabular-nums text-slate-400">
                      {t.catalog.cost(money(product.costPriceCents))}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge
                      status={evaluation.status}
                      remaining={evaluation.remaining}
                      unit={product.unit}
                      minStockAlert={product.minStockAlert}
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        product.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {product.isActive ? t.catalog.active : t.catalog.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(product)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                        {t.catalog.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(product)}
                        disabled={busyId === product.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {product.isActive
                          ? t.catalog.deactivate
                          : t.catalog.reactivate}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(product)}
                        disabled={busyId === product.id}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {t.catalog.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  {t.catalog.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map((product) => {
          const evaluation = evaluateStockLevel(
            product.stockQuantity,
            0,
            product.minStockAlert
          );
          return (
            <div
              key={product.id}
              className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
                product.isActive ? "" : "opacity-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                  {product.name}
                </p>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {product.category}
                </span>
                <StockBadge
                  status={evaluation.status}
                  remaining={evaluation.remaining}
                  unit={product.unit}
                  minStockAlert={product.minStockAlert}
                  locale={locale}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-mono text-slate-500">
                  {product.barcode ?? "—"}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {money(product.salePriceCents)}
                  </span>
                  <span className="text-slate-400">
                    {t.catalog.cost(money(product.costPriceCents))}
                  </span>
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(product)}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  {t.catalog.edit}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(product)}
                  disabled={busyId === product.id}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  {t.catalog.delete}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
            {t.catalog.empty}
          </div>
        ) : null}
      </div>

      <ProductCreationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(product) =>
          setProducts((previous) => [product, ...previous])
        }
        features={features}
        locale={locale}
        currency={currency}
      />

      <ProductEditModal
        open={editingProduct !== null}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onUpdated={handleUpdated}
        features={features}
        locale={locale}
        currency={currency}
      />

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => setSearch(code)}
        locale={locale}
      />
    </div>
  );
}
