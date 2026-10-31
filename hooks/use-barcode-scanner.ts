"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  onError?: (reason: "too_fast_reset" | "too_short" | "ignored_input") => void;
  minChars?: number;
  maxIntervalMs?: number;
  requireEnter?: boolean;
  enabled?: boolean;
  ignoreEditableInputs?: boolean;
  pauseMs?: number;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

export function useBarcodeScanner(options: UseBarcodeScannerOptions): void {
  const {
    onScan,
    onError,
    minChars = 4,
    maxIntervalMs = 50,
    requireEnter = true,
    enabled = true,
    ignoreEditableInputs = true,
    pauseMs = 120,
  } = options;

  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let buffer = "";
    let lastTimestamp = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPendingReset = () => {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
    };

    const resetBuffer = () => {
      buffer = "";
      lastTimestamp = 0;
      clearPendingReset();
    };

    const scheduleReset = () => {
      clearPendingReset();
      resetTimer = setTimeout(() => {
        buffer = "";
        lastTimestamp = 0;
        resetTimer = null;
      }, pauseMs);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (ignoreEditableInputs && isEditableTarget(event.target)) {
        if (buffer.length > 0) {
          resetBuffer();
        }
        return;
      }

      const now = performance.now();
      const interval = now - lastTimestamp;
      lastTimestamp = now;

      if (event.key === "Enter") {
        if (buffer.length === 0) {
          return;
        }
        event.preventDefault();
        clearPendingReset();
        const scanned = buffer;
        buffer = "";
        if (scanned.length < minChars) {
          onErrorRef.current?.("too_short");
          return;
        }
        onScanRef.current(scanned);
        return;
      }

      if (event.key.length !== 1) {
        if (buffer.length > 0 && (event.key === "Backspace" || event.key === "Escape")) {
          resetBuffer();
        }
        return;
      }

      if (buffer.length > 0 && interval > maxIntervalMs) {
        const dropped = buffer;
        buffer = "";
        if (dropped.length >= minChars) {
          onErrorRef.current?.("too_fast_reset");
        }
      }

      buffer += event.key;
      scheduleReset();

      if (!requireEnter && buffer.length >= minChars) {
        const scanned = buffer;
        buffer = "";
        clearPendingReset();
        onScanRef.current(scanned);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearPendingReset();
    };
  }, [
    enabled,
    ignoreEditableInputs,
    maxIntervalMs,
    minChars,
    pauseMs,
    requireEnter,
  ]);
}
