import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, GripVertical, Loader2 } from "lucide-react";
import {
  movePdfShape,
  normalizedRectangle,
  screenPointToPdf,
} from "../utils/pdfCoordinates";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const textShapeTypes = new Set(["text", "watermark"]);
const isTextShape = (shape) => textShapeTypes.has(shape.type);

const defaultShape = (tool, point, pageNumber) => {
  const common = {
    id: crypto.randomUUID(),
    page_number: pageNumber,
    color: "#dc2626",
    fill_color: "",
    stroke_width: 3,
    opacity: 0.35,
  };

  if (tool === "text" || tool === "watermark") {
    return {
      ...common,
      type: tool,
      x: point.x,
      y: point.y,
      width: tool === "watermark" ? 260 : 160,
      height: tool === "watermark" ? 70 : 48,
      text: tool === "watermark" ? "CONFIDENTIAL" : "Text",
      font_size: tool === "watermark" ? 32 : 16,
      color: tool === "watermark" ? "#64748b" : "#111827",
      opacity: tool === "watermark" ? 0.25 : 1,
    };
  }

  return { ...common, type: tool, x: point.x, y: point.y, width: 0, height: 0 };
};

const Shape = ({ shape, selected, onPointerDown }) => {
  const stroke = shape.color || "#dc2626";
  const fill = shape.fill_color || (shape.type === "highlight" ? "#fde047" : "transparent");
  const pointerProps = {
    onPointerDown,
    className: "cursor-move",
    style: { pointerEvents: "all" },
  };

  if (shape.type === "pen") {
    return (
      <polyline
        {...pointerProps}
        points={(shape.points || []).map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={shape.stroke_width || 3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (shape.type === "arrow") {
    const angle = Math.atan2(shape.y2 - shape.y, shape.x2 - shape.x);
    const size = 12;
    const points = [
      [shape.x2, shape.y2],
      [shape.x2 - size * Math.cos(angle - Math.PI / 6), shape.y2 - size * Math.sin(angle - Math.PI / 6)],
      [shape.x2 - size * Math.cos(angle + Math.PI / 6), shape.y2 - size * Math.sin(angle + Math.PI / 6)],
    ];
    return (
      <g {...pointerProps}>
        <line x1={shape.x} y1={shape.y} x2={shape.x2} y2={shape.y2} stroke={stroke} strokeWidth={shape.stroke_width || 3} />
        <polygon points={points.map((point) => point.join(",")).join(" ")} fill={stroke} />
      </g>
    );
  }

  const isImage = ["signature", "stamp"].includes(shape.type);
  return (
    <g {...pointerProps}>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.type === "highlight" ? 2 : 0}
        fill={isImage ? "rgba(79,70,229,0.08)" : fill}
        fillOpacity={shape.type === "highlight" ? shape.opacity ?? 0.35 : 1}
        stroke={selected ? "#4f46e5" : stroke}
        strokeWidth={selected ? 2 : shape.stroke_width || 3}
        strokeDasharray={isImage || ["crop", "redact"].includes(shape.type) ? "8 5" : undefined}
      />
      {isImage ? (
        <text x={shape.x + 8} y={shape.y + 22} fill="#4338ca" fontSize="13" fontWeight="700">
          {shape.type === "signature" ? "Signature image" : "Stamp image"}
        </text>
      ) : null}
      {shape.type === "redact" ? (
        <text x={shape.x + 8} y={shape.y + 22} fill="#dc2626" fontSize="12" fontWeight="700">REDACT</text>
      ) : null}
    </g>
  );
};

const TextShapeOverlay = ({
  shape,
  selected,
  pageSize,
  renderWidth,
  renderHeight,
  onDragStart,
  onSelect,
  onTextChange,
}) => {
  const textareaRef = useRef(null);
  const scaleX = renderWidth / pageSize.width;
  const scaleY = renderHeight / pageSize.height;
  const fontSize = Math.max(10, (shape.font_size || 18) * scaleX);

  useEffect(() => {
    if (!selected) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [selected, shape.id]);

  return (
    <div
      data-testid={`pdf-text-shape-${shape.id}`}
      className={`absolute pointer-events-auto ${selected ? "ring-2 ring-indigo-500" : "ring-1 ring-transparent hover:ring-indigo-300"}`}
      style={{
        left: shape.x * scaleX,
        top: shape.y * scaleY,
        width: Math.max(36, (shape.width || 0) * scaleX),
        height: Math.max(28, (shape.height || 0) * scaleY),
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(shape.id);
      }}
    >
      {selected ? (
        <button
          type="button"
          aria-label={`Move ${shape.type === "watermark" ? "watermark" : "text"} box`}
          className="absolute -left-3 -top-3 z-20 flex h-6 w-6 cursor-move touch-none items-center justify-center rounded-md border border-indigo-200 bg-white text-indigo-600 shadow-sm"
          onPointerDown={(event) => onDragStart(event, shape)}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <textarea
        ref={textareaRef}
        value={shape.text || ""}
        onChange={(event) => onTextChange(shape.id, event.target.value)}
        onFocus={() => onSelect(shape.id)}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(shape.id);
        }}
        className="h-full w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-0 font-semibold leading-tight outline-none"
        style={{
          color: shape.color || "#111827",
          fontSize,
          lineHeight: 1.15,
          opacity: shape.opacity ?? 1,
        }}
        spellCheck={false}
      />
    </div>
  );
};

const PdfDocumentCanvas = ({
  documentRecord,
  pageNumber,
  zoom,
  activeTool,
  shapes,
  setShapes,
  selectedShapeId,
  setSelectedShapeId,
  onDocumentLoaded,
  onPageLoaded,
}) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const drawingRef = useRef(null);
  const draggingRef = useRef(null);
  const pageSizeRef = useRef({ width: 612, height: 792 });
  const [containerWidth, setContainerWidth] = useState(800);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.max(320, entry.contentRect.width - 32));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const renderWidth = Math.min(containerWidth, 900) * zoom;
  const renderHeight = renderWidth * (pageSize.height / pageSize.width);
  const pageShapes = useMemo(
    () => shapes.filter((shape) => shape.page_number === pageNumber),
    [shapes, pageNumber]
  );
  const svgShapes = useMemo(() => pageShapes.filter((shape) => !isTextShape(shape)), [pageShapes]);
  const textShapes = useMemo(() => pageShapes.filter(isTextShape), [pageShapes]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  const capturePointer = (pointerId) => {
    if (pointerId === undefined || !svgRef.current?.setPointerCapture) return;
    if (svgRef.current.hasPointerCapture?.(pointerId)) return;
    try {
      svgRef.current.setPointerCapture(pointerId);
    } catch {
      // Window-level tracking still keeps dragging responsive if capture is unavailable.
    }
  };

  const releasePointer = (pointerId) => {
    if (pointerId === undefined || !svgRef.current?.releasePointerCapture) return;
    if (svgRef.current.hasPointerCapture && !svgRef.current.hasPointerCapture(pointerId)) return;
    try {
      svgRef.current.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture can already be released after pointerup/cancel.
    }
  };

  const pointerPoint = useCallback((event) => {
    if (!svgRef.current) return null;
    const bounds = svgRef.current.getBoundingClientRect();
    const currentPageSize = pageSizeRef.current;
    return screenPointToPdf({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds,
      pageWidth: currentPageSize.width,
      pageHeight: currentPageSize.height,
    });
  }, []);

  const updateShape = useCallback((id, updater) => {
    setShapes((current) => current.map((shape) => (shape.id === id ? updater(shape) : shape)));
  }, [setShapes]);

  const updateShapeText = useCallback((id, text) => {
    updateShape(id, (shape) => ({ ...shape, text }));
  }, [updateShape]);

  const handlePointerDown = (event) => {
    if (!activeTool || activeTool === "select") {
      setSelectedShapeId(null);
      return;
    }
    capturePointer(event.pointerId);
    const start = pointerPoint(event);
    if (!start) return;

    if (["text", "watermark"].includes(activeTool)) {
      const shape = defaultShape(activeTool, start, pageNumber);
      setShapes((current) => [...current, shape]);
      setSelectedShapeId(shape.id);
      return;
    }

    const shape = defaultShape(activeTool, start, pageNumber);
    if (activeTool === "pen") shape.points = [start];
    if (activeTool === "arrow") Object.assign(shape, { x2: start.x, y2: start.y });
    setShapes((current) => [...current, shape]);
    setSelectedShapeId(shape.id);
    drawingRef.current = { id: shape.id, pointerId: event.pointerId, start, tool: activeTool };
  };

  const handlePointerMove = useCallback((event) => {
    if (draggingRef.current) {
      if (draggingRef.current.pointerId !== event.pointerId) return;
      const point = pointerPoint(event);
      if (!point) return;
      const drag = draggingRef.current;
      const currentPageSize = pageSizeRef.current;
      updateShape(drag.id, (shape) =>
        movePdfShape(shape, point.x - drag.last.x, point.y - drag.last.y, currentPageSize.width, currentPageSize.height)
      );
      draggingRef.current.last = point;
      return;
    }

    const drawing = drawingRef.current;
    if (!drawing) return;
    if (drawing.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    if (!point) return;
    updateShape(drawing.id, (shape) => {
      if (drawing.tool === "pen") return { ...shape, points: [...(shape.points || []), point] };
      if (drawing.tool === "arrow") return { ...shape, x2: point.x, y2: point.y };
      return { ...shape, ...normalizedRectangle(drawing.start, point) };
    });
  }, [pointerPoint, updateShape]);

  const stopPointerAction = useCallback((event) => {
    const pointerId = event?.pointerId ?? drawingRef.current?.pointerId ?? draggingRef.current?.pointerId;
    releasePointer(pointerId);
    drawingRef.current = null;
    draggingRef.current = null;
  }, []);

  useEffect(() => {
    const handleWindowPointerMove = (event) => {
      if (!drawingRef.current && !draggingRef.current) return;
      handlePointerMove(event);
    };
    const handleWindowPointerEnd = (event) => {
      if (!drawingRef.current && !draggingRef.current) return;
      stopPointerAction(event);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
    };
  }, [handlePointerMove, stopPointerAction]);

  const startShapeDrag = (event, shape) => {
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event.pointerId);
    const start = pointerPoint(event);
    if (!start) return;
    setSelectedShapeId(shape.id);
    draggingRef.current = { id: shape.id, pointerId: event.pointerId, last: start };
  };

  if (!documentRecord) return null;

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full justify-center overflow-auto bg-slate-100/80 p-4 md:p-8">
      {error ? (
        <div className="m-auto rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8" />
          <p className="font-bold">This PDF could not be displayed.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : (
        <div
          className="relative self-start overflow-hidden bg-white shadow-2xl shadow-slate-900/20"
          style={{ width: renderWidth, height: renderHeight }}
        >
          <Document
            key={`${documentRecord.id}-${documentRecord.current_version_id}`}
            file={`${documentRecord.content_url}?version=${documentRecord.current_version_id}`}
            onLoadSuccess={(value) => {
              setError("");
              onDocumentLoaded?.(value.numPages);
            }}
            onLoadError={(value) => setError(value?.message || "Unable to load PDF.")}
            loading={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}
          >
            <Page
              pageNumber={pageNumber}
              width={renderWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={(page) => {
                const viewport = page.getViewport({ scale: 1 });
                const next = { width: viewport.width, height: viewport.height };
                setPageSize(next);
                onPageLoaded?.(next);
              }}
            />
          </Document>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
            className={`absolute inset-0 h-full w-full touch-none ${activeTool ? "cursor-crosshair" : ""}`}
            onPointerDown={handlePointerDown}
          >
            {svgShapes.map((shape) => (
              <Shape
                key={shape.id}
                shape={shape}
                selected={shape.id === selectedShapeId}
                onPointerDown={(event) => startShapeDrag(event, shape)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0">
            {textShapes.map((shape) => (
              <TextShapeOverlay
                key={shape.id}
                shape={shape}
                selected={shape.id === selectedShapeId}
                pageSize={pageSize}
                renderWidth={renderWidth}
                renderHeight={renderHeight}
                onDragStart={startShapeDrag}
                onSelect={setSelectedShapeId}
                onTextChange={updateShapeText}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfDocumentCanvas;
