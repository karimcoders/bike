"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ScanLine, AlertCircle, SwitchCamera, CheckCircle2, Check } from "lucide-react";
import { toast } from "sonner";

// =====================================================================
// BarcodeScanner — REAL device camera barcode scanner
// ---------------------------------------------------------------------
// Uses @zxing/browser (ZXing) to read 1D & 2D barcodes directly from the
// device camera. Supports the common retail formats an Indian bike-parts
// shop will encounter:
//   EAN-13, EAN-8, UPC-A, UPC-E  (printed product barcodes)
//   Code-128, Code-39             (logistics / OEM labels)
//   QR-Code                        (UPI / QR codes)
//
// Flow:
//   1. Owner taps "SCAN PRODUCT" in the Sell screen.
//   2. This dialog opens and requests camera access (prefer rear camera).
//   3. ZXing continuously decodes frames from the video stream.
//   4. Single-scan mode (default): on first valid decode → onDetected(code)
//      fires + dialog closes.
//   5. Multi-scan mode (multiScan=true): on each decode → onDetected(code)
//      fires (parent adds to cart), camera keeps running, debounce is
//      reset after ~400ms so the SAME or NEXT barcode can be scanned again.
//      A green "✓ Added" flash appears inside the dialog. Owner taps
//      "Done" to close.
//   6. If multiple cameras exist, owner can switch front/back.
//
// Graceful fallbacks:
//   - No camera / permission denied → clear Hinglish message + manual
//     entry field so the owner can type the barcode from the keyboard.
// =====================================================================

export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  multiScan = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  /** When true, the dialog stays open after each detection so the owner
   *  can scan product after product continuously. The parent adds each
   *  code to the cart; the owner taps "Done" to close. */
  multiScan?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastDetectedRef = useRef<{ code: string; at: number } | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"starting" | "scanning" | "error" | "denied">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [manualCode, setManualCode] = useState("");
  // Brief green "✓ Added: {code}" flash shown inside the dialog (multiScan
  // mode) every time a code is detected. Auto-clears after ~1.2s.
  const [flash, setFlash] = useState<{ code: string } | null>(null);

  // Show the flash + schedule its auto-clear. Re-using a single timer ref
  // so rapid back-to-back scans keep the banner visible.
  const triggerFlash = useCallback((code: string) => {
    setFlash({ code });
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, 1200);
  }, []);

  // ---- Start the camera + decoder ----
  const start = useCallback(async (deviceId?: string) => {
    setStatus("starting");
    setErrorMsg("");

    // Clean up any previous session first
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;

    try {
      const cams = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(cams);

      // One reader instance is reused across restarts.
      const reader =
        readerRef.current ||
        new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 150,
        });
      readerRef.current = reader;

      const chosen =
        deviceId ||
        activeDeviceId ||
        pickRearCamera(cams) ||
        cams[0]?.deviceId;

      if (!chosen) {
        setStatus("error");
        setErrorMsg("Is device me koi camera nahi mila.");
        return;
      }
      setActiveDeviceId(chosen);

      const videoEl = videoRef.current;
      if (!videoEl) return;

      const controls = await reader.decodeFromVideoDevice(
        chosen,
        videoEl,
        (result, _err, ctrl) => {
          if (result) {
            const code = result.getText().trim();
            if (!code) return;
            // Debounce: ZXing can fire the same code several times/sec.
            // In multiScan mode the cooldown is much shorter (400ms) so
            // the owner can scan the same product repeatedly to bump qty,
            // or scan a different product immediately.
            const now = Date.now();
            const last = lastDetectedRef.current;
            const cooldown = multiScan ? 400 : 1500;
            if (last && last.code === code && now - last.at < cooldown) {
              return;
            }
            lastDetectedRef.current = { code, at: now };
            try {
              if (navigator.vibrate) navigator.vibrate(80);
              beep();
            } catch {
              /* ignore */
            }
            onDetected(code);
            if (multiScan) {
              // Keep the camera running so the owner can scan the next
              // product. Reset the debounce shortly so the SAME code can
              // be scanned again (e.g. 3x same product → qty 3).
              window.setTimeout(() => {
                lastDetectedRef.current = null;
              }, 400);
              triggerFlash(code);
            } else {
              ctrl.stop();
              onOpenChange(false);
            }
          }
        }
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (e: any) {
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setErrorMsg(
          "Camera permission nahi mili. Browser settings me is site ko camera access dein, phir try karein."
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("error");
        setErrorMsg("Is device me camera nahi mila. Manual barcode type karein.");
      } else {
        setStatus("error");
        setErrorMsg(e?.message || "Camera start nahi hua. Manual entry use karein.");
      }
    }
  }, [activeDeviceId, onDetected, onOpenChange, multiScan, triggerFlash]);

  // ---- Auto-start when dialog opens ----
  useEffect(() => {
    if (!open) return;
    lastDetectedRef.current = null;
    // start() initializes the device camera (an external system) and
    // reports its state via setStatus/setErrorMsg. This is the canonical
    // "synchronize with an external system" effect use case — the setState
    // calls reflect camera status, not derived React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start();
    return () => {
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, [open, start]);

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) {
      toast.error("Pehle barcode number likhein");
      return;
    }
    onDetected(code);
    if (multiScan) {
      // Keep dialog open; let the owner keep typing/scanning.
      setManualCode("");
      triggerFlash(code);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-5 text-primary" /> Scan Product Barcode
          </DialogTitle>
          <DialogDescription className="text-xs">
            {multiScan
              ? "Scan karte rahein — har barcode auto-add hoga. Done ho jaane par 'Done' dabayein."
              : "Product ke barcode par camera point karein. Auto-detect hoga."}
          </DialogDescription>
        </DialogHeader>

        {/* Camera viewport */}
        <div className="relative aspect-[4/3] bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
          />
          {multiScan && flash && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              <CheckCircle2 className="size-3.5" /> Added:{" "}
              <span className="font-mono">{flash.code}</span>
            </div>
          )}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[70%] h-[40%] rounded-xl border-2 border-white/80 shadow-glow">
                <span className="absolute -top-px -left-px size-5 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <span className="absolute -top-px -right-px size-5 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <span className="absolute -bottom-px -left-px size-5 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <span className="absolute -bottom-px -right-px size-5 border-b-4 border-r-4 border-primary rounded-br-lg" />
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary animate-pulse" />
              </div>
            </div>
          )}

          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">Camera on ho raha hai…</p>
            </div>
          )}

          {(status === "error" || status === "denied") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/95 p-4 text-center text-white">
              <AlertCircle className="size-8 text-amber-400" />
              <p className="text-sm font-medium">Camera kaam nahi kar raha</p>
              <p className="text-xs text-zinc-300 max-w-[260px]">{errorMsg}</p>
            </div>
          )}

          {status === "scanning" && devices.length > 1 && (
            <button
              onClick={() => {
                const idx = devices.findIndex((d) => d.deviceId === activeDeviceId);
                const next = devices[(idx + 1) % devices.length];
                start(next.deviceId);
              }}
              className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
              aria-label="Switch camera"
            >
              <SwitchCamera className="size-5" />
            </button>
          )}
        </div>

        {/* Manual entry fallback + Done (multiScan) */}
        <div className="p-4 space-y-3 border-t bg-muted/30">
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitManual();
                }
              }}
              placeholder="Ya yahan barcode type karein…"
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm font-mono"
              inputMode="numeric"
              autoFocus={status === "error" || status === "denied"}
            />
            <Button onClick={submitManual} className="h-11 rounded-xl">
              {multiScan ? "Add" : "Search"}
            </Button>
          </div>
          {multiScan ? (
            <Button
              onClick={() => onOpenChange(false)}
              size="lg"
              className="h-12 w-full rounded-xl bg-primary text-primary-foreground shadow-glow text-base"
            >
              <Check className="size-5" /> Done
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center">
              Camera nahi hai? Keyboard se bhi barcode daal sakte hain.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pick the rear/back camera by heuristics on the label.
function pickRearCamera(cams: MediaDeviceInfo[]): string | undefined {
  const rear = cams.find((c) => /back|rear|environment/i.test(c.label || ""));
  return rear?.deviceId;
}

// Short beep using the WebAudio API — no audio file needed.
function beep() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "square";
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}
