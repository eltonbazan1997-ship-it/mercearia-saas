"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkoutWithWhatsAppAction } from "@/app/actions/checkout-with-whatsapp";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModalLazy";
import { ReceiptPrintModal } from "@/components/pos/ReceiptPrintModal";
import { StockBadge } from "@/components/pos/StockBadge";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";
import type { FiadoReceiptData } from "@/lib/printer/receipt-types";
import {
  buildWhatsAppBillingLink,
} from "@/lib/payment/qr-billing-engine";
import { buildPixPayload } from "@/lib/payments/pix";
import { formatCentsAsCurrency, resolveCurrencySymbol } from "@/lib/pricing-calculator";
import { formatWhatsAppThermalReceipt } from "@/lib/whatsapp/receipt-formatter";
import {
  buildCartSubtotalCents,
  changeCartItemQuantity,
  evaluateStockLevel,
  playPOSFeedbackSound,
  repriceCartForPayment,
  unitPriceForPayment,
  upsertCartItem,
  type CartItem,
  type CustomerCreditProfile,
  type ProductCatalogItem,
} from "@/lib/stock-engine";
import type { TenantFeatures } from "@/lib/features";

export interface POSTerminalCustomer {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  debtCents: number;
  creditLimitCents: number;
  trustedPerson1Name?: string | null;
  trustedPerson2Name?: string | null;
}

export interface POSTerminalWithDispatchProps {
  products: ProductCatalogItem[];
  customers: POSTerminalCustomer[];
  features: TenantFeatures;
  locale: Locale;
  currency: string;
  operatorName: string;
  tenantPixKey?: string | null;
  tenantPixName?: string | null;
  tenantPixCity?: string | null;
  tenantBobQrImage?: string | null;
}

interface ToastState {
  tone: "success" | "error" | "info";
  message: string;
}

function toCents(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function POSTerminalWithDispatch({
  products,
  customers,
  features,
  locale,
  currency,
  operatorName,
  tenantPixKey,
  tenantPixName,
  tenantPixCity,
  tenantBobQrImage,
}: POSTerminalWithDispatchProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | "credit">("cash");
  const [qrVariant, setQrVariant] = useState<"pix" | "bob">(() =>
    currency === "BRL" ? "pix" : "bob"
  );
  const [qrStage, setQrStage] = useState<"setup" | "collect">("setup");
  const [buyerChoice, setBuyerChoice] = useState<"titular" | "person1" | "person2">(
    "titular"
  );
  const [operator, setOperator] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mercearia_operator_name") || operatorName;
    }
    return operatorName;
  });
  const [editingOperator, setEditingOperator] = useState(false);
  const [tempOperator, setTempOperator] = useState(operator);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tendered, setTendered] = useState("");
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [lastReceipt, setLastReceipt] = useState<FiadoReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [stockOverrides, setStockOverrides] = useState<Record<string, number>>({});
  const [copiedPix, setCopiedPix] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = getUiDictionary(locale);
  const symbol = resolveCurrencySymbol(currency);

  const saveOperator = () => {
    const trimmed = tempOperator.trim() || operatorName;
    setOperator(trimmed);
    if (typeof window !== "undefined") {
      localStorage.setItem("mercearia_operator_name", trimmed);
    }
    setEditingOperator(false);
  };

  useEffect(() => {
    const mode = paymentMethod === "credit" ? "credit" : "cash";
    setCart((currentCart) => repriceCartForPayment(currentCart, mode));
    setQrStage("setup");
  }, [paymentMethod]);

  const pixPayload = useMemo(() => {
    if (!tenantPixKey) return null;
    return buildPixPayload({
      key: tenantPixKey,
      name: tenantPixName || "MERCADO",
      city: tenantPixCity || "BRASIL",
      amountCents: buildCartSubtotalCents(cart),
    });
  }, [tenantPixKey, tenantPixName, tenantPixCity, cart]);

  const copyPixCode = () => {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  };

  const effectiveProducts = useMemo(
    () =>
      products.map((product) =>
        Object.prototype.hasOwnProperty.call(stockOverrides, product.id)
          ? { ...product, stockQuantity: stockOverrides[product.id] }
          : product
      ),
    [products, stockOverrides]
  );

  const money = useCallback(
    (cents: number) => formatCentsAsCurrency(cents, locale, currency),
    [currency, locale]
  );

  const notify = useCallback((tone: ToastState["tone"], message: string) => {
    setToast({ tone, message });
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const cartSubtotalCents = useMemo(
    () => buildCartSubtotalCents(cart),
    [cart]
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  useEffect(() => {
    setBuyerChoice("titular");
  }, [selectedCustomerId]);

  const buyerName = useMemo(() => {
    if (!selectedCustomer) {
      return null;
    }
    if (buyerChoice === "person1" && selectedCustomer.trustedPerson1Name) {
      return selectedCustomer.trustedPerson1Name;
    }
    if (buyerChoice === "person2" && selectedCustomer.trustedPerson2Name) {
      return selectedCustomer.trustedPerson2Name;
    }
    return selectedCustomer.fullName;
  }, [buyerChoice, selectedCustomer]);

  const creditProfile: CustomerCreditProfile | null = useMemo(() => {
    if (!selectedCustomer) {
      return null;
    }
    const available = Math.max(
      selectedCustomer.creditLimitCents - selectedCustomer.debtCents,
      0
    );
    return {
      id: selectedCustomer.id,
      fullName: selectedCustomer.fullName,
      phoneNumber: selectedCustomer.phoneNumber,
      debtCents: selectedCustomer.debtCents,
      creditLimitCents: selectedCustomer.creditLimitCents,
      availableCreditCents: available,
      canTakeMore: selectedCustomer.creditLimitCents === 0 || available > 0,
    };
  }, [selectedCustomer]);

  const creditLocked = useMemo(() => {
    if (paymentMethod !== "credit" || !creditProfile) {
      return false;
    }
    if (creditProfile.creditLimitCents === 0) {
      return false;
    }
    return cartSubtotalCents > creditProfile.availableCreditCents;
  }, [cartSubtotalCents, creditProfile, paymentMethod]);

  const tenderedCents = useMemo(() => toCents(tendered), [tendered]);
  const cashShortfall =
    paymentMethod === "cash" && tenderedCents != null && tenderedCents < cartSubtotalCents;

  const changeCents =
    paymentMethod === "cash" && tenderedCents != null
      ? Math.max(tenderedCents - cartSubtotalCents, 0)
      : null;

  const qtyInCartByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((item) => map.set(item.productId, item.quantity));
    return map;
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const active = effectiveProducts.filter((product) => product.isActive);
    if (!query) {
      return active;
    }
    return active.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        (product.barcode ?? "").includes(query)
    );
  }, [effectiveProducts, search]);

  const sound = useCallback(
    (type: "SUCCESS" | "WARNING" | "ERROR") => {
      if (features.pos_sounds) {
        playPOSFeedbackSound(type);
      }
    },
    [features.pos_sounds]
  );

  const addProduct = useCallback(
    (product: ProductCatalogItem) => {
      const currentQty = qtyInCartByProduct.get(product.id) ?? 0;
      const evaluation = evaluateStockLevel(
        product.stockQuantity,
        currentQty + 1,
        product.minStockAlert
      );

      if (features.stock_block && evaluation.remaining <= 0) {
        sound("ERROR");
        notify("error", t.pos.insufficientStock(product.name));
        return;
      }

      if (evaluation.remaining <= 0) {
        sound("WARNING");
        notify("info", t.pos.negativeStock(product.name));
      } else {
        sound("SUCCESS");
      }

      const unitPriceCents = unitPriceForPayment(product, paymentMethod === "credit" ? "credit" : "cash");
      setCart((previous) =>
        upsertCartItem(previous, {
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          unit: product.unit,
          category: product.category,
          salePriceCents: product.salePriceCents,
          creditPriceCents: product.creditPriceCents,
          unitPriceCents,
          quantity: 1,
          subtotalCents: unitPriceCents,
          stockQuantity: product.stockQuantity,
          minStockAlert: product.minStockAlert,
        })
      );
    },
    [features.stock_block, notify, paymentMethod, qtyInCartByProduct, sound, t]
  );

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const product = effectiveProducts.find(
        (candidate) => candidate.isActive && candidate.barcode === barcode
      );
      if (!product) {
        sound("ERROR");
        notify("error", t.pos.barcodeNotFound(barcode));
        return;
      }
      addProduct(product);
      setSearch("");
    },
    [addProduct, effectiveProducts, notify, sound, t]
  );

  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: !pending,
    onError: () => {
      sound("ERROR");
    },
  });

  const changeQuantity = useCallback(
    (productId: string, delta: number) => {
      if (delta > 0) {
        const product = effectiveProducts.find((candidate) => candidate.id === productId);
        if (product) {
          const currentQty = qtyInCartByProduct.get(productId) ?? 0;
          const evaluation = evaluateStockLevel(
            product.stockQuantity,
            currentQty + 1,
            product.minStockAlert
          );
          if (features.stock_block && evaluation.remaining <= 0) {
            sound("ERROR");
            notify("error", t.pos.insufficientStock(product.name));
            return;
          }
        }
      }
      setCart((previous) => changeCartItemQuantity(previous, productId, delta));
      if (delta > 0) {
        sound("SUCCESS");
      }
    },
    [effectiveProducts, features.stock_block, notify, qtyInCartByProduct, sound, t]
  );

  const removeItem = useCallback(
    (productId: string) => {
      setCart((previous) => previous.filter((item) => item.productId !== productId));
      sound("WARNING");
    },
    [sound]
  );

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) {
      sound("ERROR");
      notify("error", t.pos.emptyCart);
      return;
    }
    if (paymentMethod === "credit" && !selectedCustomerId) {
      sound("ERROR");
      notify("error", t.pos.selectCustomerToast);
      return;
    }
    if (creditLocked) {
      sound("ERROR");
      notify("error", t.pos.creditExceeded);
      return;
    }
    if (cashShortfall) {
      sound("ERROR");
      notify("error", t.pos.tenderedLess);
      return;
    }

    setPending(true);
    try {
      const result = await checkoutWithWhatsAppAction({
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        paymentMethod: paymentMethod === "credit" ? "credit" : "cash",
        customerId: paymentMethod === "credit" ? selectedCustomerId : null,
        buyerName: paymentMethod === "credit" ? buyerName : null,
        tenderedCents: paymentMethod === "cash" ? tenderedCents : null,
        locale,
        sendWhatsApp: paymentMethod === "credit" && sendWhatsApp,
        notes: null,
      });

      if (!result.ok) {
        sound("ERROR");
        notify("error", result.error);
        return;
      }

      const { receipt, whatsappScheduled } = result.data;
      setLastReceipt(receipt);
      setReceiptOpen(true);
      setStockOverrides((previous) => {
        const next = { ...previous };
        for (const sold of cart) {
          const base =
            next[sold.productId] ??
            effectiveProducts.find((candidate) => candidate.id === sold.productId)
              ?.stockQuantity ??
            sold.stockQuantity;
          next[sold.productId] = base - sold.quantity;
        }
        return next;
      });
      setCart([]);
      setTendered("");
      sound("SUCCESS");
      notify(
        "success",
        whatsappScheduled ? t.pos.saleDoneWhatsapp : t.pos.saleDone
      );
    } catch {
      sound("ERROR");
      notify("error", t.pos.checkoutFailed);
    } finally {
      setPending(false);
    }
  }, [
    cart,
    creditLocked,
    cashShortfall,
    effectiveProducts,
    buyerName,
    locale,
    notify,
    paymentMethod,
    pending,
    selectedCustomerId,
    sendWhatsApp,
    sound,
    t,
    tenderedCents,
  ]);

  const openWhatsAppDispatch = useCallback(() => {
    if (!features.whatsapp) {
      notify("info", t.pos.whatsappDisabled);
      return;
    }
    if (!lastReceipt) {
      setSendWhatsApp(true);
      notify("info", t.pos.whatsappNextCredit);
      return;
    }
    if (!lastReceipt.customerPhone) {
      notify("error", t.pos.lastSaleNoPhone);
      return;
    }
    const link = buildWhatsAppBillingLink(
      lastReceipt.customerPhone,
      formatWhatsAppThermalReceipt(lastReceipt),
      lastReceipt.locale
    );
    if (!link) {
      notify("error", t.pos.invalidPhone);
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }, [features.whatsapp, lastReceipt, notify, t]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) {
          if (event.key !== "F2" && event.key !== "F4") {
            return;
          }
        }
      }
      if (event.key === "F2") {
        event.preventDefault();
        openWhatsAppDispatch();
      }
      if (event.key === "F4") {
        event.preventDefault();
        if (lastReceipt) {
          setReceiptOpen(true);
        } else {
          notify("info", t.pos.noSaleToPrint);
        }
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [lastReceipt, notify, openWhatsAppDispatch, t]);

  const creditSaleEnabled = features.fiado;

  return (
    <div className="no-print flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <div className="relative flex w-full min-w-0 items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.pos.searchPlaceholder}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm"
                aria-label={t.pos.searchAria}
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 transition active:scale-95"
                title={t.pos.camera}
                aria-label={t.pos.cameraAria}
              >
                📷
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              {editingOperator ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tempOperator}
                    onChange={(e) => setTempOperator(e.target.value)}
                    className="w-24 rounded border border-slate-300 px-1 py-0.5 text-base text-slate-800 md:text-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={saveOperator}
                    className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTempOperator(operator);
                    setEditingOperator(true);
                  }}
                  className="hover:underline flex items-center gap-1"
                >
                  👤 {operator} ✏️
                </button>
              )}
            </div>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              {t.pos.barcodeActive}
            </span>
          </div>

          <div className="hidden max-h-[340px] w-full overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t.pos.thProduct}</th>
                  <th className="px-4 py-2 font-semibold">{t.pos.thCategory}</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    {t.pos.thPrice}
                  </th>
                  <th className="px-4 py-2 font-semibold">{t.pos.thStock}</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    {t.pos.thAction}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const qty = qtyInCartByProduct.get(product.id) ?? 0;
                  const evaluation = evaluateStockLevel(
                    product.stockQuantity,
                    qty,
                    product.minStockAlert
                  );
                  return (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{product.name}</div>
                        <div className="text-xs text-slate-400">
                          {product.barcode ?? t.pos.noBarcode} · {product.unit}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{product.category}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                        {money(product.salePriceCents)}
                      </td>
                      <td className="px-4 py-2">
                        <StockBadge
                          status={evaluation.status}
                          remaining={evaluation.remaining}
                          unit={product.unit}
                          minStockAlert={product.minStockAlert}
                          locale={locale}
                          compact
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          {qty > 0 ? t.pos.addWithQty(qty) : t.pos.add}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {t.pos.noProducts}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="block w-full divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:hidden">
            {filteredProducts.map((product) => {
              const qty = qtyInCartByProduct.get(product.id) ?? 0;
              const evaluation = evaluateStockLevel(
                product.stockQuantity,
                qty,
                product.minStockAlert
              );
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 p-3 text-left transition-colors active:bg-slate-50"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {product.name}
                    </span>
                    <span className="truncate text-xs text-slate-500">
                      {product.barcode ?? t.pos.noBarcode} · {product.category}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums text-slate-900">
                      {money(product.salePriceCents)}
                    </span>
                    <StockBadge
                      status={evaluation.status}
                      remaining={evaluation.remaining}
                      unit={product.unit}
                      minStockAlert={product.minStockAlert}
                      locale={locale}
                      compact
                    />
                  </span>
                </button>
              );
            })}
            {filteredProducts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {t.pos.noProducts}
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wide">
                {t.pos.cartTitle(cart.length)}
              </span>
              <span className="hidden items-center text-xs text-slate-400 sm:inline-flex">
                {t.pos.shortcuts}
              </span>
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {t.pos.cartEmpty}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t.pos.thItem}</th>
                      <th className="px-3 py-2 font-semibold">{t.pos.thQty}</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t.pos.thSubtotal}
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((item) => {
                      const product = effectiveProducts.find(
                        (candidate) => candidate.id === item.productId
                      );
                      const evaluation = evaluateStockLevel(
                        product?.stockQuantity ?? item.stockQuantity,
                        item.quantity,
                        product?.minStockAlert ?? item.minStockAlert
                      );
                      return (
                        <tr key={item.productId} className="bg-white">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">{item.name}</div>
                            <div className="flex items-center gap-2 pt-1">
                              <StockBadge
                                status={evaluation.status}
                                remaining={evaluation.remaining}
                                unit={item.unit}
                                minStockAlert={evaluation.minStockAlert}
                                locale={locale}
                                compact
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => changeQuantity(item.productId, -1)}
                                className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
                                aria-label={t.pos.decrease}
                              >
                                −
                              </button>
                              <span className="w-8 text-center tabular-nums font-semibold">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeQuantity(item.productId, 1)}
                                className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
                                aria-label={t.pos.increase}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                            {money(item.subtotalCents)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId)}
                              className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                            >
                              {t.pos.remove}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t.pos.payment}
            </h2>
            <div className="mt-2 grid w-full min-w-0 grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex w-full min-w-0 items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold transition-all ${
                  paymentMethod === "cash"
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t.pos.cash}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("qr")}
                className={`flex w-full min-w-0 items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold transition-all ${
                  paymentMethod === "qr"
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t.pos.qrMode}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!creditSaleEnabled) {
                    notify("info", t.pos.creditDisabledToast);
                    return;
                  }
                  setPaymentMethod("credit");
                }}
                disabled={!creditSaleEnabled}
                className={`flex w-full min-w-0 items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  paymentMethod === "credit"
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t.pos.credit}
              </button>
            </div>
          </div>

          {paymentMethod === "cash" ? (
            <div>
              <label
                htmlFor="tendered-input"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {t.pos.tendered(symbol)}
              </label>
              <input
                id="tendered-input"
                type="text"
                inputMode="decimal"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
                placeholder={t.pos.tenderedPlaceholder}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm"
              />
              {tenderedCents != null ? (
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>{t.pos.change}</span>
                    <span className="font-semibold tabular-nums">
                      {money(changeCents ?? 0)}
                    </span>
                  </div>
                  {cashShortfall ? (
                    <p className="font-semibold text-red-600">
                      {t.pos.shortfall(money(cartSubtotalCents - tenderedCents))}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : paymentMethod === "qr" ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setQrVariant("pix")}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                    qrVariant === "pix"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {t.pos.qrOptionPix}
                </button>
                <button
                  type="button"
                  onClick={() => setQrVariant("bob")}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                    qrVariant === "bob"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {t.pos.qrOptionBob}
                </button>
              </div>

              {qrStage === "setup" ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">{t.pos.qrStageHint}</p>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t.pos.totalLabel}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-slate-900">
                      {money(cartSubtotalCents)}
                    </span>
                  </div>
              <button
                type="button"
                onClick={() => setQrStage("collect")}
                disabled={cart.length === 0}
                className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                {t.pos.qrShowQr}
              </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">{t.pos.qrCollectHint}</p>

                  {qrVariant === "pix" ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {t.pos.qrPixTitle}
                      </h3>
                      {pixPayload ? (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-600">{t.pos.qrHintBrl}</p>
                          <div className="rounded border border-slate-200 bg-white p-2 font-mono text-[10px] break-all max-h-24 overflow-auto">
                            {pixPayload}
                          </div>
                          <button
                            type="button"
                            onClick={copyPixCode}
                            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            {copiedPix ? "✓ Copiado!" : t.pos.copyPix}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600">{t.pos.qrEmpty}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {t.pos.qrBobTitle}
                      </h3>
                      {tenantBobQrImage ? (
                        <div className="space-y-2 text-center">
                          <p className="text-xs text-slate-600">{t.pos.qrHintBob}</p>
                          <img src={tenantBobQrImage} alt="QR Simple" className="mx-auto h-40 w-40 object-contain rounded border bg-white p-1" />
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600">{t.pos.qrEmpty}</p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setQrStage("setup")}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                  >
                    {t.pos.qrHideQr}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label
                htmlFor="customer-select"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {t.pos.customerLabel}
              </label>
              <select
                id="customer-select"
                value={selectedCustomerId ?? ""}
                onChange={(event) =>
                  setSelectedCustomerId(event.target.value || null)
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500 md:text-sm"
              >
                <option value="">{t.pos.selectCustomer}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.fullName}
                  </option>
                ))}
              </select>

              {selectedCustomer ? (
                <div className="mt-3">
                  <label
                    htmlFor="buyer-select"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {t.pos.buyerLabel}
                  </label>
                  <select
                    id="buyer-select"
                    value={buyerChoice}
                    onChange={(event) =>
                      setBuyerChoice(
                        event.target.value as "titular" | "person1" | "person2"
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-500 md:text-sm"
                  >
                    <option value="titular">
                      {t.pos.buyerTitular} · {selectedCustomer.fullName}
                    </option>
                    {selectedCustomer.trustedPerson1Name ? (
                      <option value="person1">
                        {t.pos.buyerPerson1} · {selectedCustomer.trustedPerson1Name}
                      </option>
                    ) : null}
                    {selectedCustomer.trustedPerson2Name ? (
                      <option value="person2">
                        {t.pos.buyerPerson2} · {selectedCustomer.trustedPerson2Name}
                      </option>
                    ) : null}
                  </select>
                </div>
              ) : null}

              {creditProfile ? (
                <dl className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <dt>{t.pos.currentDebt}</dt>
                    <dd className="font-semibold tabular-nums text-red-600">
                      {money(creditProfile.debtCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.pos.creditLimit}</dt>
                    <dd className="tabular-nums">
                      {money(creditProfile.creditLimitCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t.pos.available}</dt>
                    <dd className="tabular-nums">{money(creditProfile.availableCreditCents)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <dt>{t.pos.afterSale}</dt>
                    <dd className="font-semibold tabular-nums">
                      {money(
                        Math.min(
                          creditProfile.debtCents + cartSubtotalCents,
                          creditProfile.creditLimitCents > 0
                            ? creditProfile.creditLimitCents
                            : creditProfile.debtCents + cartSubtotalCents
                        )
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  {t.pos.selectCustomerHint}
                </p>
              )}

              {creditLocked ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  <span aria-hidden="true">🔒</span>
                  {t.pos.creditExceeded}
                </div>
              ) : null}

              <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(event) => setSendWhatsApp(event.target.checked)}
                  disabled={!features.whatsapp}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {t.pos.sendReceipt}
              </label>
              {!features.whatsapp ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  {t.pos.whatsappDisabledNote}
                </p>
              ) : null}
            </div>
          )}

          <div className="box-border flex w-full max-w-full flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-md">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{t.pos.totalLabel}</span>
              <span>{t.pos.itemsCount(cart.length)}</span>
            </div>
            <p className="text-3xl font-bold tabular-nums">
              {money(cartSubtotalCents)}
            </p>
            <div className="space-y-1 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>{t.pos.formLabel}</span>
                <span>
                  {paymentMethod === "credit"
                    ? t.pos.credit
                    : paymentMethod === "qr"
                      ? t.pos.qrMode
                      : t.pos.cash}
                </span>
              </div>
              {paymentMethod === "cash" && tenderedCents != null ? (
                <div className="flex justify-between">
                  <span>{t.pos.change}</span>
                  <span className="tabular-nums">{money(changeCents ?? 0)}</span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={
                pending ||
                cart.length === 0 ||
                creditLocked ||
                cashShortfall ||
                (paymentMethod === "credit" && !selectedCustomerId)
              }
              className="flex w-full items-center justify-center rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending
                ? t.pos.processing
                : paymentMethod === "credit"
                  ? t.pos.finishCredit
                  : t.pos.finishCash}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={openWhatsAppDispatch}
              className="flex-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {t.pos.f2Whatsapp}
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastReceipt) {
                  setReceiptOpen(true);
                } else {
                  notify("info", t.pos.noSaleToPrint);
                }
              }}
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {t.pos.f4Print}
            </button>
          </div>
        </aside>
      </div>

      {toast ? (
        <div
          className={`fixed bottom-5 right-5 z-40 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-xl ${
            toast.tone === "success"
              ? "bg-emerald-600 text-white"
              : toast.tone === "error"
                ? "bg-red-600 text-white"
                : "bg-slate-800 text-white"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <ReceiptPrintModal
        receipt={lastReceipt}
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        thermalPrinterEnabled={features.thermal_printer}
        locale={locale}
      />

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeScan}
        locale={locale}
      />
    </div>
  );
}
