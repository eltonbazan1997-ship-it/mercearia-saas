"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useThermalPrinter } from "@/hooks/use-thermal-printer";
import type { FiadoReceiptData, ReceiptWidth } from "@/lib/printer/receipt-types";
import { ThermalReceiptTemplate } from "@/components/printer/ThermalReceiptTemplate";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export interface ReceiptPrintModalProps {
  receipt: FiadoReceiptData | null;
  open: boolean;
  onClose: () => void;
  thermalPrinterEnabled?: boolean;
  locale?: Locale;
}

export function ReceiptPrintModal({
  receipt,
  open,
  onClose,
  thermalPrinterEnabled = true,
  locale = "pt-BR",
}: ReceiptPrintModalProps) {
  const [width, setWidth] = useState<ReceiptWidth>(receipt?.width ?? "58mm");
  const previewRef = useRef<HTMLDivElement | null>(null);
  const { printElement, isPrinting, lastError } = useThermalPrinter();
  const [status, setStatus] = useState<string | null>(null);
  const t = getUiDictionary(receipt?.locale ?? locale);

  useEffect(() => {
    if (receipt) {
      setWidth(receipt.width);
      setStatus(null);
    }
  }, [receipt]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handlePrint = useCallback(async () => {
    if (!thermalPrinterEnabled) {
      setStatus(t.receiptModal.printerDisabled);
      return;
    }
    setStatus(null);
    const element = previewRef.current;
    const printed = await printElement(element, {
      widthMm: width === "80mm" ? 80 : 58,
      title: receipt ? `cupom-${receipt.checksum}` : "cupom",
    });
    if (!printed) {
      setStatus(
        lastError
          ? t.receiptModal.printFailed(lastError)
          : t.receiptModal.printFailedGeneric
      );
    }
  }, [lastError, printElement, receipt, t, thermalPrinterEnabled, width]);

  if (!open || !receipt) {
    return null;
  }

  const widthOptions: Array<{ value: ReceiptWidth; label: string }> = [
    { value: "58mm", label: t.receiptModal.roll58 },
    { value: "80mm", label: t.receiptModal.roll80 },
  ];

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.receiptModal.aria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="my-auto flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {t.receiptModal.title}
            </h2>
            <p className="text-xs text-slate-500">{receipt.checksum}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            aria-label={t.receiptModal.close}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs font-medium text-slate-600">
            {t.receiptModal.width}
          </span>
          {widthOptions.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                width === option.value
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              <input
                type="radio"
                name="receipt-width"
                className="sr-only"
                value={option.value}
                checked={width === option.value}
                onChange={() => setWidth(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>

        <div className="flex-1 overflow-auto bg-slate-200 p-6">
          <div ref={previewRef} className="mx-auto w-max shadow-lg">
            <ThermalReceiptTemplate data={{ ...receipt, width }} />
          </div>
        </div>

        {status ? (
          <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-700">
            {status}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {t.receiptModal.close}
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={isPrinting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isPrinting ? t.receiptModal.printing : t.receiptModal.print}
          </button>
        </div>
      </div>
    </div>
  );
}
