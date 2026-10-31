"use client";

import dynamic from "next/dynamic";
import type { BarcodeScannerModalProps } from "@/components/pos/BarcodeScannerModal";

export const BarcodeScannerModal = dynamic<BarcodeScannerModalProps>(
  () =>
    import("@/components/pos/BarcodeScannerModal").then((module) => ({
      default: module.BarcodeScannerModal,
    })),
  { ssr: false }
);
