"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCustomerAction,
  deleteCustomerAction,
  getCustomerLedgerAction,
  sendFiadoChargeAction,
  settleCustomerDebtAction,
  updateCustomerAction,
  type CustomerLedgerPayload,
} from "@/app/actions/fiado-actions";
import {
  getFiadoDictionary,
  LOCALE_LABELS,
  type Locale,
} from "@/lib/i18n/fiado-dictionary";
import type { TenantFeatures } from "@/lib/features";
import {
  buildPaymentQRCodePayload,
  buildWhatsAppBillingLink,
} from "@/lib/payment/qr-billing-engine";
import { formatCentsAsCurrency } from "@/lib/pricing-calculator";

export interface LedgerCustomer {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  debtCents: number;
  creditLimitCents: number;
  trustedPerson1Name?: string | null;
  trustedPerson1Phone?: string | null;
  trustedPerson2Name?: string | null;
  trustedPerson2Phone?: string | null;
}

export interface CustomerLedgerManagerProps {
  initialCustomers: LedgerCustomer[];
  locale: Locale;
  features: TenantFeatures;
  currency: string;
  storeName: string;
  storeTenantId: string;
}

type ToastTone = "success" | "error" | "info";

interface ToastState {
  tone: ToastTone;
  message: string;
}

function parseReaisToCents(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

const TYPE_LABEL_KEY: Record<
  "debit" | "payment" | "adjustment",
  "debitEntry" | "paymentEntry" | "adjustmentEntry"
> = {
  debit: "debitEntry",
  payment: "paymentEntry",
  adjustment: "adjustmentEntry",
};

export function CustomerLedgerManager({
  initialCustomers,
  locale: initialLocale,
  features,
  currency,
  storeName,
  storeTenantId,
}: CustomerLedgerManagerProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [customers, setCustomers] = useState<LedgerCustomer[]>(initialCustomers);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCustomers[0]?.id ?? null
  );
  const [ledger, setLedger] = useState<CustomerLedgerPayload | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [qrImage, setQrImage] = useState<{ url: string; amountCents: number } | null>(
    null
  );
  const [statementFilter, setStatementFilter] = useState<"all" | "day" | "week" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    fullName: "",
    phoneNumber: "",
    creditLimit: "",
    trustedPerson1Name: "",
    trustedPerson1Phone: "",
    trustedPerson2Name: "",
    trustedPerson2Phone: "",
  });
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState({
    fullName: "",
    phoneNumber: "",
    creditLimit: "",
    notes: "",
    trustedPerson1Name: "",
    trustedPerson1Phone: "",
    trustedPerson2Name: "",
    trustedPerson2Phone: "",
  });
  const [editFormError, setEditFormError] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    if (!ledger) return [];
    const entries = ledger.entries;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (statementFilter === "day") {
      return entries.filter((e) => e.createdAt.startsWith(todayStr));
    }
    if (statementFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return entries.filter((e) => new Date(e.createdAt) >= weekAgo);
    }
    if (statementFilter === "month") {
      const currentMonth = now.toISOString().slice(0, 7);
      return entries.filter((e) => e.createdAt.startsWith(currentMonth));
    }
    if (statementFilter === "custom" && customStart && customEnd) {
      return entries.filter((e) => {
        const d = e.createdAt.slice(0, 10);
        return d >= customStart && d <= customEnd;
      });
    }
    return entries;
  }, [ledger, statementFilter, customStart, customEnd]);

  const handleDeleteCustomer = async () => {
    if (!ledger) return;
    if (ledger.customer.debtCents > 0) {
      notify("error", "Não é possível excluir cliente com saldo devedor em aberto.");
      return;
    }
    if (!window.confirm(`Deseja excluir o cliente "${ledger.customer.fullName}"?`)) {
      return;
    }
    setBusy(true);
    const res = await deleteCustomerAction(ledger.customer.id);
    setBusy(false);
    if (!res.ok) {
      notify("error", res.error);
      return;
    }
    notify("success", "Cliente excluído com sucesso");
    setCustomers((prev) => prev.filter((c) => c.id !== ledger.customer.id));
    const remaining = customers.filter((c) => c.id !== ledger.customer.id);
    setSelectedId(remaining[0]?.id ?? null);
  };

  const dictionary = useMemo(() => getFiadoDictionary(locale), [locale]);

  const money = useCallback(
    (cents: number) => formatCentsAsCurrency(cents, locale, currency),
    [currency, locale]
  );

  const notify = useCallback((tone: ToastTone, message: string) => {
    setToast({ tone, message });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const refreshLedger = useCallback(async (customerId: string) => {
    setLedgerLoading(true);
    try {
      const result = await getCustomerLedgerAction(customerId);
      if (result.ok) {
        setLedger(result.data);
        setCustomers((previous) =>
          previous.map((customer) =>
            customer.id === result.data.customer.id
              ? {
                  ...customer,
                  fullName: result.data.customer.fullName,
                  phoneNumber: result.data.customer.phoneNumber,
                  debtCents: result.data.customer.debtCents,
                  creditLimitCents: result.data.customer.creditLimitCents,
                  trustedPerson1Name: result.data.customer.trustedPerson1Name,
                  trustedPerson1Phone: result.data.customer.trustedPerson1Phone,
                  trustedPerson2Name: result.data.customer.trustedPerson2Name,
                  trustedPerson2Phone: result.data.customer.trustedPerson2Phone,
                }
              : customer
          )
        );
      } else {
        notify("error", result.error);
      }
    } catch {
      notify("error", dictionary.loadFailed);
    } finally {
      setLedgerLoading(false);
    }
  }, [dictionary.loadFailed, notify]);

  useEffect(() => {
    if (selectedId) {
      void refreshLedger(selectedId);
    } else {
      setLedger(null);
    }
  }, [refreshLedger, selectedId]);

  const handleSettle = useCallback(
    async (amountCents: number, full = false) => {
      if (!selectedId || amountCents <= 0) {
        notify("error", dictionary.amountToSettle);
        return;
      }
      setBusy(true);
      try {
        const result = await settleCustomerDebtAction({
          customerId: selectedId,
          amountCents,
          notes: full ? "quitacao_total" : "abono_parcial",
        });
        if (!result.ok) {
          notify("error", result.error);
          return;
        }
        notify(
          "success",
          `${dictionary.settlementSuccess}: ${money(result.data.appliedCents)}`
        );
        setSettleAmount("");
        await refreshLedger(selectedId);
      } catch {
        notify("error", dictionary.settlementFailed);
      } finally {
        setBusy(false);
      }
    },
    [dictionary, money, notify, refreshLedger, selectedId]
  );

  const handleCreateCustomer = useCallback(async () => {
    setCustomerFormError(null);
    const limitCents = parseReaisToCents(newCustomer.creditLimit || "0") ?? 0;
    setBusy(true);
    try {
      const result = await createCustomerAction({
        fullName: newCustomer.fullName,
        phoneNumber: newCustomer.phoneNumber.trim() ? newCustomer.phoneNumber.trim() : null,
        creditLimitCents: limitCents,
        notes: null,
        trustedPerson1Name: newCustomer.trustedPerson1Name.trim() || null,
        trustedPerson1Phone: newCustomer.trustedPerson1Phone.trim() || null,
        trustedPerson2Name: newCustomer.trustedPerson2Name.trim() || null,
        trustedPerson2Phone: newCustomer.trustedPerson2Phone.trim() || null,
      });
      if (!result.ok) {
        setCustomerFormError(result.error);
        return;
      }
      notify("success", `${dictionary.newCustomer}: ${newCustomer.fullName}`);
      setNewCustomer({
        fullName: "",
        phoneNumber: "",
        creditLimit: "",
        trustedPerson1Name: "",
        trustedPerson1Phone: "",
        trustedPerson2Name: "",
        trustedPerson2Phone: "",
      });
      setShowCustomerForm(false);
      const refreshed = await getCustomerLedgerAction(result.data.customerId);
      if (refreshed.ok) {
        const created = refreshed.data.customer;
        setCustomers((previous) => [
          ...previous,
          {
            id: created.id,
            fullName: created.fullName,
            phoneNumber: created.phoneNumber,
            debtCents: created.debtCents,
            creditLimitCents: created.creditLimitCents,
            trustedPerson1Name: created.trustedPerson1Name,
            trustedPerson1Phone: created.trustedPerson1Phone,
            trustedPerson2Name: created.trustedPerson2Name,
            trustedPerson2Phone: created.trustedPerson2Phone,
          },
        ]);
        setSelectedId(created.id);
      }
    } catch {
      setCustomerFormError(dictionary.loadFailed);
    } finally {
      setBusy(false);
    }
  }, [dictionary, newCustomer, notify]);

  const openEditForm = useCallback(() => {
    if (!ledger) return;
    setEditFormError(null);
    setEditCustomer({
      fullName: ledger.customer.fullName,
      phoneNumber: ledger.customer.phoneNumber ?? "",
      creditLimit: (ledger.customer.creditLimitCents / 100)
        .toFixed(2)
        .replace(".", ","),
      notes: ledger.customer.notes ?? "",
      trustedPerson1Name: ledger.customer.trustedPerson1Name ?? "",
      trustedPerson1Phone: ledger.customer.trustedPerson1Phone ?? "",
      trustedPerson2Name: ledger.customer.trustedPerson2Name ?? "",
      trustedPerson2Phone: ledger.customer.trustedPerson2Phone ?? "",
    });
    setShowEditForm(true);
  }, [ledger]);

  const handleUpdateCustomer = useCallback(async () => {
    if (!ledger) return;
    setEditFormError(null);
    const limitCents = parseReaisToCents(editCustomer.creditLimit || "0") ?? 0;
    setBusy(true);
    try {
      const result = await updateCustomerAction({
        id: ledger.customer.id,
        fullName: editCustomer.fullName,
        phoneNumber: editCustomer.phoneNumber.trim()
          ? editCustomer.phoneNumber.trim()
          : null,
        creditLimitCents: limitCents,
        notes: editCustomer.notes.trim() ? editCustomer.notes.trim() : null,
        trustedPerson1Name: editCustomer.trustedPerson1Name.trim() || null,
        trustedPerson1Phone: editCustomer.trustedPerson1Phone.trim() || null,
        trustedPerson2Name: editCustomer.trustedPerson2Name.trim() || null,
        trustedPerson2Phone: editCustomer.trustedPerson2Phone.trim() || null,
      });
      if (!result.ok) {
        setEditFormError(result.error);
        return;
      }
      notify("success", dictionary.customerUpdated);
      setShowEditForm(false);
      setCustomers((previous) =>
        previous.map((customer) =>
          customer.id === ledger.customer.id
            ? {
                ...customer,
                fullName: editCustomer.fullName,
                phoneNumber: editCustomer.phoneNumber.trim()
                  ? editCustomer.phoneNumber.trim()
                  : null,
                creditLimitCents: limitCents,
                trustedPerson1Name: editCustomer.trustedPerson1Name.trim() || null,
                trustedPerson1Phone: editCustomer.trustedPerson1Phone.trim() || null,
                trustedPerson2Name: editCustomer.trustedPerson2Name.trim() || null,
                trustedPerson2Phone: editCustomer.trustedPerson2Phone.trim() || null,
              }
            : customer
        )
      );
      await refreshLedger(ledger.customer.id);
    } catch {
      setEditFormError(dictionary.customerUpdateFailed);
    } finally {
      setBusy(false);
    }
  }, [dictionary, editCustomer, ledger, notify, refreshLedger]);

  const buildStatementForCustomer = useCallback(() => {
    if (!ledger) {
      return null;
    }
    const entries = ledger.entries.slice(0, 10).map((entry) => ({
      createdAt: entry.createdAt,
      type: entry.type,
      amountCents: entry.amountCents,
      balanceAfterCents: entry.balanceAfterCents,
      notes: entry.notes,
    }));
    return [
      `*${storeName}*`,
      `*${dictionary.statement}*`,
      `${dictionary.customer}: ${ledger.customer.fullName}`,
      "",
      ...entries.map(
        (entry) =>
          `${entry.createdAt.slice(0, 10)}  ${
            dictionary[TYPE_LABEL_KEY[entry.type]]
          }  ${money(entry.amountCents)} → ${money(entry.balanceAfterCents)}`
      ),
      "",
      `*${dictionary.debt}: ${money(ledger.customer.debtCents)}*`,
    ].join("\n");
  }, [dictionary, ledger, money, storeName]);

  const openWhatsAppStatement = useCallback(() => {
    if (!ledger?.customer.phoneNumber) {
      notify("error", dictionary.phoneRequired);
      return;
    }
    const message = buildStatementForCustomer();
    if (!message) {
      return;
    }
    const link = buildWhatsAppBillingLink(
      ledger.customer.phoneNumber,
      message,
      locale
    );
    if (!link) {
      notify("error", dictionary.phoneRequired);
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }, [buildStatementForCustomer, dictionary, ledger, locale, notify]);

  const dispatchCharge = useCallback(async () => {
    if (!selectedId) {
      notify("error", dictionary.noCustomerSelected);
      return;
    }
    setBusy(true);
    try {
      const result = await sendFiadoChargeAction(selectedId);
      if (!result.ok) {
        notify("error", result.error);
        return;
      }
      if (result.data.sent) {
        notify("success", dictionary.chargeSent);
        return;
      }
      if (result.data.whatsappUrl) {
        window.open(result.data.whatsappUrl, "_blank", "noopener,noreferrer");
        notify("info", dictionary.openWhatsappLink);
        return;
      }
      notify("error", dictionary.chargeFailed);
    } catch {
      notify("error", dictionary.chargeFailed);
    } finally {
      setBusy(false);
    }
  }, [dictionary, notify, selectedId]);

  const generateSettlementQr = useCallback(async () => {
    if (!ledger) {
      return;
    }
    try {
      const amountCents = ledger.customer.debtCents;
      const payload = buildPaymentQRCodePayload({
        tenantId: storeTenantId,
        customerId: ledger.customer.id,
        amountCents,
        reference: `ledger-${ledger.customer.id}`,
        kind: "fiado_full_settlement",
      });
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(payload, {
        type: "image/png",
        width: 1024,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrImage({ url: dataUrl, amountCents });
    } catch {
      notify("error", dictionary.generateQrSettlement);
    }
  }, [dictionary, ledger, notify, storeTenantId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) ?? null,
    [customers, selectedId]
  );

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm";

  return (
    <div className="no-print grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {dictionary.customers}
          </h2>
          <div className="flex items-center gap-1 text-[11px]">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                className={`rounded-md px-2 py-1 font-semibold transition ${
                  locale === code
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-pressed={locale === code}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[360px] overflow-auto">
          <ul className="divide-y divide-slate-100">
            {customers.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                    selectedId === customer.id
                      ? "bg-blue-50 text-blue-800"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span>
                    <span className="block font-medium">{customer.fullName}</span>
                    <span className="block text-xs text-slate-400">
                      {customer.phoneNumber ?? "—"}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      customer.debtCents > 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {money(customer.debtCents)}
                  </span>
                </button>
              </li>
            ))}
            {customers.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                {dictionary.newCustomer}
              </li>
            ) : null}
          </ul>
        </div>

        <div className="border-t border-slate-200 p-3">
          {!showCustomerForm ? (
            <button
              type="button"
              onClick={() => setShowCustomerForm(true)}
              disabled={!features.fiado}
              className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            >
              + {dictionary.newCustomer}
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder={dictionary.customer}
                value={newCustomer.fullName}
                onChange={(event) =>
                  setNewCustomer((previous) => ({
                    ...previous,
                    fullName: event.target.value,
                  }))
                }
                className={inputClass}
              />
              <input
                type="tel"
                placeholder="+5511999999999"
                value={newCustomer.phoneNumber}
                onChange={(event) =>
                  setNewCustomer((previous) => ({
                    ...previous,
                    phoneNumber: event.target.value,
                  }))
                }
                className={inputClass}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder={`${dictionary.creditLimit} (R$)`}
                value={newCustomer.creditLimit}
                onChange={(event) =>
                  setNewCustomer((previous) => ({
                    ...previous,
                    creditLimit: event.target.value,
                  }))
                }
                className={inputClass}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {dictionary.trustedPersons}
                </p>
                <p className="mb-1.5 text-[10px] text-slate-400">
                  {dictionary.trustedPersonHint}
                </p>
                <div className="space-y-1.5">
                  {(
                    [
                      { person: dictionary.trustedPerson1, nameKey: "trustedPerson1Name" as const, phoneKey: "trustedPerson1Phone" as const },
                      { person: dictionary.trustedPerson2, nameKey: "trustedPerson2Name" as const, phoneKey: "trustedPerson2Phone" as const },
                    ]
                  ).map((person) => (
                    <div key={person.nameKey} className="space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500">
                        {person.person}
                      </p>
                      <input
                        type="text"
                        placeholder={dictionary.customer}
                        value={newCustomer[person.nameKey]}
                        onChange={(event) =>
                          setNewCustomer((previous) => ({
                            ...previous,
                            [person.nameKey]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <input
                        type="tel"
                        placeholder={`+5511999999999 · ${dictionary.trustedPersonPhone}`}
                        value={newCustomer[person.phoneKey]}
                        onChange={(event) =>
                          setNewCustomer((previous) => ({
                            ...previous,
                            [person.phoneKey]: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {customerFormError ? (
                <p className="text-xs text-red-600">{customerFormError}</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateCustomer()}
                  disabled={busy || newCustomer.fullName.trim().length < 2}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {dictionary.save}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomerForm(false)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  {dictionary.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {!selectedCustomer || !ledger ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {ledgerLoading ? dictionary.loading : dictionary.selectCustomer}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {dictionary.creditLedger}
                </h2>
                <p className="text-sm text-slate-500">
                  {ledger.customer.fullName} ·{" "}
                  {ledger.customer.phoneNumber ?? dictionary.phoneRequired}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openEditForm}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {dictionary.editCustomer}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteCustomer()}
                  disabled={busy || ledger.customer.debtCents > 0}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  title={ledger.customer.debtCents > 0 ? "Não é possível excluir com saldo devedor" : "Excluir cliente"}
                >
                  Excluir cliente
                </button>
                <button
                  type="button"
                  onClick={() => void dispatchCharge()}
                  disabled={busy || !ledger.customer.phoneNumber}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {dictionary.sendCharge}
                </button>
                <button
                  type="button"
                  onClick={openWhatsAppStatement}
                  disabled={!ledger.customer.phoneNumber}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {dictionary.openWhatsappLink}
                </button>
                <button
                  type="button"
                  onClick={() => void generateSettlementQr()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {dictionary.generateQrSettlement}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
                  {dictionary.debt}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-red-700">
                  {money(ledger.customer.debtCents)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {dictionary.creditLimit}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-700">
                  {money(ledger.customer.creditLimitCents)}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {dictionary.availableCredit}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                  {money(
                    Math.max(
                      ledger.customer.creditLimitCents - ledger.customer.debtCents,
                      0
                    )
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {dictionary.trustedPersons}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    person: dictionary.trustedPerson1,
                    name: ledger.customer.trustedPerson1Name,
                    phone: ledger.customer.trustedPerson1Phone,
                  },
                  {
                    person: dictionary.trustedPerson2,
                    name: ledger.customer.trustedPerson2Name,
                    phone: ledger.customer.trustedPerson2Phone,
                  },
                ].map((trusted) => (
                  <div
                    key={trusted.person}
                    className="rounded-lg bg-white px-3 py-2 text-sm"
                  >
                    <p className="text-[11px] font-semibold uppercase text-slate-400">
                      {trusted.person}
                    </p>
                    <p className="font-medium text-slate-700">
                      {trusted.name ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {trusted.phone ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0 flex-1 basis-52">
                <label
                  htmlFor="settle-amount"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {dictionary.amountToSettle}
                </label>
                <input
                  id="settle-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={settleAmount}
                  onChange={(event) => setSettleAmount(event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const cents = parseReaisToCents(settleAmount);
                  if (cents == null) {
                    notify("error", dictionary.amountToSettle);
                    return;
                  }
                  void handleSettle(cents, false);
                }}
                disabled={busy || ledger.customer.debtCents === 0}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {dictionary.confirmSettlement}
              </button>
              <button
                type="button"
                onClick={() => void handleSettle(ledger.customer.debtCents, true)}
                disabled={busy || ledger.customer.debtCents === 0}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {dictionary.settleFullDebt}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {dictionary.statement}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {(
                    [
                      { key: "all", label: "Todos" },
                      { key: "day", label: "Dia" },
                      { key: "week", label: "Semana" },
                      { key: "month", label: "Mês" },
                      { key: "custom", label: "Personalizado" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatementFilter(f.key)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        statementFilter === f.key
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {statementFilter === "custom" && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500">Início</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-base md:text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Fim</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-base md:text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="hidden max-h-[300px] overflow-auto rounded-lg border border-slate-200 md:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">
                        {dictionary.transactionDate}
                      </th>
                      <th className="px-3 py-2 font-semibold">
                        {dictionary.transactionType}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {dictionary.transactionAmount}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {dictionary.balanceAfter}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="bg-white">
                        <td className="px-3 py-2 text-slate-600">
                          <div>{new Date(entry.createdAt).toLocaleString(locale)}</div>
                          {entry.items && entry.items.length > 0 && (
                            <div className="mt-1 pl-2 text-[11px] text-slate-500 space-y-0.5 border-l-2 border-slate-200">
                              {entry.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between">
                                  <span>• {it.productName} ({it.quantity}x {money(it.unitPriceCents)})</span>
                                  <span className="tabular-nums font-medium">{money(it.subtotalCents)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              entry.type === "payment"
                                ? "bg-emerald-100 text-emerald-700"
                                : entry.type === "debit"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {dictionary[TYPE_LABEL_KEY[entry.type]]}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums">
                          {money(entry.amountCents)}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-semibold tabular-nums">
                          {money(entry.balanceAfterCents)}
                        </td>
                      </tr>
                    ))}
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-slate-400"
                        >
                          {dictionary.noTransactions}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 md:hidden">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">
                        {new Date(entry.createdAt).toLocaleString(locale)}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          entry.type === "payment"
                            ? "bg-emerald-100 text-emerald-700"
                            : entry.type === "debit"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {dictionary[TYPE_LABEL_KEY[entry.type]]}
                      </span>
                    </div>
                    {entry.items && entry.items.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 border-l-2 border-slate-200 pl-2 text-xs text-slate-600">
                        {entry.items.map((it, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span className="min-w-0">
                              • {it.productName} ({it.quantity}x {money(it.unitPriceCents)})
                            </span>
                            <span className="shrink-0 tabular-nums font-medium">
                              {money(it.subtotalCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex justify-end gap-4 text-xs">
                      <span className="text-slate-500">
                        {dictionary.transactionAmount}:{" "}
                        <span className="font-semibold tabular-nums text-slate-800">
                          {money(entry.amountCents)}
                        </span>
                      </span>
                      <span className="text-slate-500">
                        {dictionary.balanceAfter}:{" "}
                        <span className="font-semibold tabular-nums text-slate-800">
                          {money(entry.balanceAfterCents)}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
                {filteredEntries.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-400">
                    {dictionary.noTransactions}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>

      {showEditForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={dictionary.editCustomer}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowEditForm(false);
            }
          }}
        >
          <div className="my-auto max-h-[85dvh] w-full max-w-md space-y-2 overflow-y-auto rounded-xl bg-white p-6 pb-10 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-800">
              {dictionary.editCustomer}
            </h3>
            <input
              type="text"
              placeholder={dictionary.customer}
              value={editCustomer.fullName}
              onChange={(event) =>
                setEditCustomer((previous) => ({
                  ...previous,
                  fullName: event.target.value,
                }))
              }
              className={inputClass}
            />
            <input
              type="tel"
              placeholder="+5511999999999"
              value={editCustomer.phoneNumber}
              onChange={(event) =>
                setEditCustomer((previous) => ({
                  ...previous,
                  phoneNumber: event.target.value,
                }))
              }
              className={inputClass}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={`${dictionary.creditLimit} (R$)`}
              value={editCustomer.creditLimit}
              onChange={(event) =>
                setEditCustomer((previous) => ({
                  ...previous,
                  creditLimit: event.target.value,
                }))
              }
              className={inputClass}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {dictionary.trustedPersons}
              </p>
              <p className="mb-1.5 text-[10px] text-slate-400">
                {dictionary.trustedPersonHint}
              </p>
              <div className="space-y-1.5">
                {[
                  { person: dictionary.trustedPerson1, nameKey: "trustedPerson1Name" as const, phoneKey: "trustedPerson1Phone" as const },
                  { person: dictionary.trustedPerson2, nameKey: "trustedPerson2Name" as const, phoneKey: "trustedPerson2Phone" as const },
                ].map((person) => (
                  <div key={person.nameKey} className="space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500">
                      {person.person}
                    </p>
                    <input
                      type="text"
                      placeholder={dictionary.customer}
                      value={editCustomer[person.nameKey]}
                      onChange={(event) =>
                        setEditCustomer((previous) => ({
                          ...previous,
                          [person.nameKey]: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      placeholder={`+5511999999999 · ${dictionary.trustedPersonPhone}`}
                      value={editCustomer[person.phoneKey]}
                      onChange={(event) =>
                        setEditCustomer((previous) => ({
                          ...previous,
                          [person.phoneKey]: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
            {editFormError ? (
              <p className="text-xs text-red-600">{editFormError}</p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleUpdateCustomer()}
                disabled={busy || editCustomer.fullName.trim().length < 2}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {dictionary.save}
              </button>
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                {dictionary.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={dictionary.qrSettlementTitle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setQrImage(null);
            }
          }}
        >
          <div className="my-auto max-h-[85dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-xl bg-white p-6 pb-8 text-center shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-800">
              {dictionary.qrSettlementTitle}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{dictionary.qrSettlementHint}</p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
              {money(qrImage.amountCents)}
            </p>
            <img
              src={qrImage.url}
              alt={dictionary.scanToSettle}
              width={320}
              height={320}
              className="mx-auto mt-4 rounded-lg border border-slate-200"
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setQrImage(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {dictionary.close}
              </button>
              <a
                href={qrImage.url}
                download={`qr-quitacao-${ledger?.customer.id ?? "cliente"}.png`}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {dictionary.downloadQrImage}
              </a>
            </div>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
