"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ThermalPrintOptions {
  widthMm?: 58 | 80;
  title?: string;
  cleanupDelayMs?: number;
}

function collectDocumentStyles(): string {
  const chunks: string[] = [];
  if (typeof document === "undefined") {
    return "";
  }
  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      const rules = styleSheet.cssRules;
      for (const rule of Array.from(rules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

function buildBaseCss(widthMm: 58 | 80): string {
  return `
    @page { size: auto; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: "Courier New", ui-monospace, monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .thermal-print-root {
      width: ${widthMm}mm;
      margin: 0 auto;
      box-sizing: border-box;
      background: #ffffff;
      color: #000000;
    }
    .thermal-print-root * { box-sizing: border-box; }
    img { max-width: 100%; }
  `;
}

export function useThermalPrinter() {
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const cleanup = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    iframeRef.current = null;
    setIsPrinting(false);
  }, []);

  const printHtml = useCallback(
    async (html: string, options?: ThermalPrintOptions): Promise<boolean> => {
      if (typeof document === "undefined") {
        setLastError("dom_unavailable");
        return false;
      }

      const widthMm = options?.widthMm ?? 58;
      const title = options?.title ?? "receipt";
      const cleanupDelayMs = options?.cleanupDelayMs ?? 1500;

      cleanup();

      try {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        iframe.setAttribute("title", title);
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.style.opacity = "0";
        iframe.style.pointerEvents = "none";
        document.body.appendChild(iframe);
        iframeRef.current = iframe;

        const frameDocument = iframe.contentDocument;
        if (!frameDocument) {
          cleanup();
          setLastError("frame_unavailable");
          return false;
        }

        const userStyles = collectDocumentStyles();
        frameDocument.open();
        frameDocument.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>${buildBaseCss(widthMm)}</style>
<style>${userStyles}</style>
</head>
<body>
<div class="thermal-print-root">${html}</div>
</body>
</html>`);
        frameDocument.close();

        await new Promise<void>((resolve) => {
          const done = () => resolve();
          if (frameDocument.readyState === "complete") {
            resolve();
            return;
          }
          iframe.addEventListener("load", () => resolve(), { once: true });
          setTimeout(done, 600);
        });

        setIsPrinting(true);
        setLastError(null);

        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          cleanup();
          setLastError("frame_window_unavailable");
          return false;
        }

        frameWindow.focus();
        frameWindow.print();

        setTimeout(() => {
          cleanup();
        }, cleanupDelayMs);

        return true;
      } catch (error) {
        cleanup();
        setLastError(error instanceof Error ? error.message : "print_failed");
        return false;
      }
    },
    [cleanup]
  );

  const printElement = useCallback(
    async (
      element: HTMLElement | null,
      options?: ThermalPrintOptions
    ): Promise<boolean> => {
      if (!element) {
        setLastError("element_unavailable");
        return false;
      }
      const clone = element.cloneNode(true) as HTMLElement;
      clone.classList.remove("no-print");
      return printHtml(clone.outerHTML, options);
    },
    [printHtml]
  );

  useEffect(() => {
    return () => {
      const iframe = iframeRef.current;
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      iframeRef.current = null;
    };
  }, []);

  return { printHtml, printElement, isPrinting, lastError };
}
