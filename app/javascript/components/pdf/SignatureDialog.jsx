import React, { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Trash2, Upload, X } from "lucide-react";

const WIDTH = 960;
const HEIGHT = 360;
const INK_WIDTH = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const imageTypes = new Set(["image/png", "image/jpeg"]);

function drawStrokes(canvas, strokes) {
  const context = canvas?.getContext("2d");
  if (!context) return false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#111827";
  context.fillStyle = "#111827";
  context.lineWidth = INK_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.length) return;
    context.beginPath();
    context.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
    if (stroke.length === 1) {
      context.arc(stroke[0].x * canvas.width, stroke[0].y * canvas.height, INK_WIDTH / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      stroke.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
      context.stroke();
    }
  });
  return true;
}

export default function SignatureDialog({ open, onClose, onUse }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const closeRef = useRef(onClose);
  const strokesRef = useRef([]);
  const activeStroke = useRef(null);
  const previousFocus = useRef(null);
  const mounted = useRef(true);
  const session = useRef(0);
  const [strokes, setStrokes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  closeRef.current = onClose;

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (!open) return undefined;
    session.current += 1;
    mounted.current = true;
    previousFocus.current = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    strokesRef.current = [];
    activeStroke.current = null;
    setStrokes([]);
    setError("");
    setBusy(false);
    dialogRef.current?.querySelector("button")?.focus();
    const keyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])') || [])]
          .filter((control) => !control.disabled && control.getAttribute("aria-hidden") !== "true");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keyDown, true);
    return () => {
      session.current += 1;
      document.removeEventListener("keydown", keyDown, true);
      document.body.style.overflow = oldOverflow;
      activeStroke.current = null;
      previousFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    strokesRef.current = strokes;
    if (open && !drawStrokes(canvasRef.current, strokes)) setError("Drawing is unavailable in this browser. Upload a signature image instead.");
  }, [open, strokes]);

  const pointFor = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / (bounds.width || WIDTH))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / (bounds.height || HEIGHT))),
    };
  };
  const pointerDown = (event) => {
    if (busy || activeStroke.current || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    setError("");
    activeStroke.current = { pointerId: event.pointerId, points: [pointFor(event)] };
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawStrokes(canvasRef.current, [...strokesRef.current, activeStroke.current.points]);
  };
  const pointerMove = (event) => {
    const stroke = activeStroke.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    stroke.points.push(pointFor(event));
    drawStrokes(canvasRef.current, [...strokesRef.current, stroke.points]);
  };
  const finishStroke = (event, cancel = false) => {
    const stroke = activeStroke.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    activeStroke.current = null;
    if (!cancel) {
      stroke.points.push(pointFor(event));
      const next = [...strokesRef.current, stroke.points];
      strokesRef.current = next;
      setStrokes(next);
    } else drawStrokes(canvasRef.current, strokesRef.current);
    if (canvasRef.current.hasPointerCapture?.(event.pointerId)) canvasRef.current.releasePointerCapture?.(event.pointerId);
  };

  const useDrawing = async () => {
    if (!strokesRef.current.length || busy) return;
    setBusy(true);
    setError("");
    const activeSession = session.current;
    try {
      const points = strokesRef.current.flat();
      const padding = 16;
      const bounds = points.reduce((value, point) => ({
        left: Math.min(value.left, point.x * WIDTH), top: Math.min(value.top, point.y * HEIGHT),
        right: Math.max(value.right, point.x * WIDTH), bottom: Math.max(value.bottom, point.y * HEIGHT),
      }), { left: WIDTH, top: HEIGHT, right: 0, bottom: 0 });
      const left = Math.max(0, Math.floor(bounds.left - padding));
      const top = Math.max(0, Math.floor(bounds.top - padding));
      const right = Math.min(WIDTH, Math.ceil(bounds.right + padding));
      const bottom = Math.min(HEIGHT, Math.ceil(bounds.bottom + padding));
      const output = document.createElement("canvas");
      output.width = Math.max(1, right - left);
      output.height = Math.max(1, bottom - top);
      const context = output.getContext("2d");
      if (!context) throw new Error("Could not create the signature image.");
      context.drawImage(canvasRef.current, left, top, output.width, output.height, 0, 0, output.width, output.height);
      const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create the signature image. Try uploading an image instead.");
      if (!mounted.current || session.current !== activeSession) return;
      const file = new File([blob], "signature.png", { type: "image/png" });
      const previewUrl = URL.createObjectURL(file);
      try { await onUse(file, previewUrl, { width: output.width, height: output.height }); }
      catch (failure) { URL.revokeObjectURL(previewUrl); throw failure; }
      closeRef.current();
    } catch (failure) {
      if (mounted.current && session.current === activeSession) setError(failure.message || "Could not create the signature.");
    } finally { if (mounted.current && session.current === activeSession) setBusy(false); }
  };

  const uploadSignature = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!imageTypes.has(file.type)) { setError("Choose a PNG or JPEG image."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError("Signature images must be smaller than 10 MB."); return; }
    setBusy(true);
    setError("");
    const activeSession = session.current;
    const previewUrl = URL.createObjectURL(file);
    try {
      const size = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight ? resolve({ width: image.naturalWidth, height: image.naturalHeight }) : reject(new Error("This image is empty."));
        image.onerror = () => reject(new Error("This image could not be opened. Choose another image."));
        image.src = previewUrl;
      });
      if (!mounted.current || session.current !== activeSession) { URL.revokeObjectURL(previewUrl); return; }
      await onUse(file, previewUrl, size);
      closeRef.current();
    } catch (failure) {
      URL.revokeObjectURL(previewUrl);
      if (mounted.current && session.current === activeSession) setError(failure.message || "Could not use this signature image.");
    } finally { if (mounted.current && session.current === activeSession) setBusy(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">Add your signature</h2>
          <button type="button" onClick={onClose} className="toolbar-button" aria-label="Close signature dialog"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-sm text-slate-500">Draw with your mouse, pen, or finger. You can move and resize it on the PDF.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200" style={{ backgroundColor: "#fff" }}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finishStroke} onPointerCancel={(event) => finishStroke(event, true)} aria-label="Draw your signature" className="block w-full" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: "none", cursor: "crosshair" }} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button type="button" disabled={!strokes.length || busy} onClick={() => setStrokes((current) => current.slice(0, -1))} className="inspector-button"><RotateCcw className="h-4 w-4" />Undo stroke</button>
          <button type="button" disabled={!strokes.length || busy} onClick={() => setStrokes([])} className="inspector-button"><Trash2 className="h-4 w-4" />Clear</button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-indigo-500 ${busy ? "pointer-events-none opacity-50" : ""}`}>
            <Upload className="h-4 w-4" />Upload an image
            <input type="file" accept="image/png,image/jpeg" aria-label="Upload signature image" disabled={busy} onChange={uploadSignature} className="sr-only" />
          </label>
          <button type="button" disabled={!strokes.length || busy} onClick={useDrawing} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Preparing…" : "Use signature"}</button>
        </div>
        <p className="mt-3 text-xs text-slate-400">This adds a visual signature. It does not create a digital certificate.</p>
      </div>
    </div>
  );
}
