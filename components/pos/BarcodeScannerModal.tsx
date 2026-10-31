"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/fiado-dictionary";
import { getUiDictionary } from "@/lib/i18n/ui-dictionary";

export interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  locale: Locale;
}

type ScannerStatus = "starting" | "active" | "error";

const SCAN_REGION_ID = "barcode-camera-scan-region";

type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

function applyVideoAttributes(video: HTMLVideoElement): void {
  try {
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("muted", "true");
    video.setAttribute("autoplay", "true");
    const playResult = video.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => undefined);
    }
  } catch {
    // iOS pode recusar play() fora de gesto do usuário; o atributo playsinline
    // aplicado acima é o que evita o feed preto.
  }
}

let scanAudioContext: AudioContext | null = null;

function playScanBeep(): void {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    if (!scanAudioContext || scanAudioContext.state === "closed") {
      scanAudioContext = new AudioContextCtor();
    }
    const context = scanAudioContext;
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.onended = () => {
      gain.disconnect();
    };
  } catch {
    // Web Audio indisponível: o feedback háptico ainda é aplicado.
  }
}

function playScanFeedback(): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(80);
    }
  } catch {
    // ignore
  }
  playScanBeep();
}

export function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
  locale,
}: BarcodeScannerModalProps) {
  const t = getUiDictionary(locale);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const torchActiveRef = useRef(false);
  const stoppingRef = useRef(false);
  const detectedRef = useRef(false);

  const disableTorch = useCallback(async () => {
    if (!torchActiveRef.current) {
      return;
    }
    torchActiveRef.current = false;
    setTorchActive(false);
    const track = trackRef.current;
    if (!track) {
      return;
    }
    try {
      await track.applyConstraints({
        advanced: [{ torch: false } as TorchConstraint],
      });
    } catch {
      // Dispositivo pode não aceitar mais constraints após fechar a câmera.
    }
  }, []);

  const stopAllTracks = useCallback(() => {
    const video = regionRef.current?.querySelector("video") ?? null;
    const stream = video ? video.srcObject : null;
    if (video && stream instanceof MediaStream) {
      for (const activeTrack of stream.getTracks()) {
        try {
          activeTrack.stop();
        } catch {
          // ignore
        }
      }
      try {
        video.srcObject = null;
      } catch {
        // ignore
      }
    }
    const track = trackRef.current;
    trackRef.current = null;
    if (track) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const stopScanner = useCallback(async () => {
    await disableTorch();
    const scanner = scannerRef.current as {
      stop?: () => Promise<void>;
      clear?: () => void;
    } | null;
    scannerRef.current = null;
    setTorchAvailable(false);
    if (scanner) {
      stoppingRef.current = true;
      try {
        await scanner.stop?.();
      } catch {
        // ignore
      }
      try {
        scanner.clear?.();
      } catch {
        // ignore
      }
      stoppingRef.current = false;
    }
    stopAllTracks();
  }, [disableTorch, stopAllTracks]);

  const refreshTorchSupport = useCallback(() => {
    const video = regionRef.current?.querySelector("video") ?? null;
    const stream = video?.srcObject;
    const track =
      stream instanceof MediaStream ? (stream.getVideoTracks()[0] ?? null) : null;
    trackRef.current = track;
    torchActiveRef.current = false;
    setTorchActive(false);
    let hasTorch = false;
    try {
      hasTorch = !!(
        track &&
        typeof track.getCapabilities === "function" &&
        (
          track.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          }
        )?.torch
      );
    } catch {
      hasTorch = false;
    }
    setTorchAvailable(hasTorch);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const next = !torchActiveRef.current;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as TorchConstraint],
      });
      torchActiveRef.current = next;
      setTorchActive(next);
    } catch {
      torchActiveRef.current = false;
      setTorchActive(false);
      setTorchAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    detectedRef.current = false;
    torchActiveRef.current = false;
    trackRef.current = null;
    setTorchActive(false);
    setTorchAvailable(false);
    setStatus("starting");
    let cancelled = false;

    const region = regionRef.current;
    const patchVideos = () => {
      const videos = region?.querySelectorAll("video");
      videos?.forEach((video) => applyVideoAttributes(video));
    };
    let videoObserver: MutationObserver | null = null;
    if (region && typeof MutationObserver === "function") {
      patchVideos();
      videoObserver = new MutationObserver(patchVideos);
      videoObserver.observe(region, { childList: true, subtree: true });
    }

    async function startScanner() {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );
        if (cancelled) {
          return;
        }
        // iOS Safari: espera a montagem completa do DOM para que o contêiner
        // tenha clientWidth/clientHeight diferentes de 0 antes do start.
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (cancelled) {
          return;
        }
        const scanner = new Html5Qrcode(SCAN_REGION_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              aspectRatio: { ideal: 1.777778 },
            },
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const isLandscape = window.innerWidth > window.innerHeight;
              return isLandscape
                ? {
                    width: Math.max(1, Math.floor(viewfinderWidth * 0.7)),
                    height: Math.max(1, Math.floor(viewfinderHeight * 0.45)),
                  }
                : {
                    width: Math.max(1, Math.floor(viewfinderWidth * 0.85)),
                    height: Math.max(1, Math.floor(viewfinderHeight * 0.28)),
                  };
            },
          },
          (decodedText: string) => {
            if (stoppingRef.current || detectedRef.current) {
              return;
            }
            detectedRef.current = true;
            playScanFeedback();
            onDetected(decodedText);
            onClose();
          },
          () => undefined
        );
        if (cancelled) {
          await stopScanner();
          return;
        }
        patchVideos();
        const video = document.querySelector<HTMLVideoElement>(
          `#${SCAN_REGION_ID} video`
        );
        if (video) {
          applyVideoAttributes(video);
        }
        refreshTorchSupport();
        setStatus("active");
      } catch {
        if (cancelled) {
          return;
        }
        setStatus("error");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      videoObserver?.disconnect();
      void stopScanner();
    };
  }, [onClose, onDetected, open, refreshTorchSupport, stopScanner]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const t2 = t.pos;

  return (
    <div
      className="fixed inset-0 z-[100] h-[100dvh] w-full overflow-hidden bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t2.scannerTitle}
    >
      <div
        id={SCAN_REGION_ID}
        ref={regionRef}
        className="absolute inset-0 z-0 h-full w-full"
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6">
        <div className="relative h-[140px] max-w-[620px] w-[min(86vw,480px)] overflow-hidden rounded-xl landscape:h-[45vh] landscape:w-[70vw]">
          <span className="absolute left-0 top-0 h-7 w-7 border-l-4 border-t-4 border-amber-400" />
          <span className="absolute right-0 top-0 h-7 w-7 border-r-4 border-t-4 border-amber-400" />
          <span className="absolute bottom-0 left-0 h-7 w-7 border-b-4 border-l-4 border-amber-400" />
          <span className="absolute bottom-0 right-0 h-7 w-7 border-b-4 border-r-4 border-amber-400" />
          <div className="scanner-laser absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-full bg-amber-500 shadow-[0_0_12px_4px_rgba(245,158,11,0.7)]" />
          </div>
        </div>
        <p className="text-xs text-white/80">{t2.scannerHint}</p>
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-6 pt-[max(0.5rem,env(safe-area-inset-top))] landscape:px-12">
        <button
          type="button"
          onClick={onClose}
          aria-label={t2.scannerClose}
          title={t2.scannerClose}
          className="pointer-events-auto rounded-full bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/70"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>

        {torchAvailable ? (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-pressed={torchActive}
            aria-label={torchActive ? t2.torchOn : t2.torchOff}
            title={t2.torch}
            className={`pointer-events-auto rounded-full p-3 transition ${
              torchActive
                ? "bg-amber-500 text-black shadow-[0_0_16px_4px_rgba(245,158,11,0.6)]"
                : "bg-black/50 text-white backdrop-blur hover:bg-black/70"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </button>
        ) : null}
      </div>

      {status !== "active" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex flex-col items-center gap-1 px-6 text-center">
          {status === "starting" ? (
            <p className="text-xs text-white/80">{t2.scannerStarting}</p>
          ) : null}
          {status === "error" ? (
            <>
              <p className="text-xs font-medium text-amber-400">
                {t2.scannerOpenError}
              </p>
              <p className="text-xs text-white/70">{t2.scannerNoCamera}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
