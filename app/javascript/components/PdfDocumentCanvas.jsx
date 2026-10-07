import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, GripVertical, Loader2 } from "lucide-react";
import {
  appendPdfPenPoint,
  boundPdfShape,
  editorPageViewport,
  getPdfShapeBounds,
  isValidPdfShape,
  movePdfShape,
  normalizedRectangle,
  proportionalRectangle,
  resizePdfShape,
  screenPointToPdf,
} from "../utils/pdfCoordinates";
import { pdfPageNumberText, renderPdfTextItem } from "../utils/pdfSearch";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const textShapeTypes = new Set(["text", "watermark"]);
const imageShapeTypes = new Set(["image", "signature", "stamp"]);
const drawingTools = new Set([
  "text",
  "watermark",
  "highlight",
  "strike",
  "pen",
  "rectangle",
  "arrow",
  "image",
  "signature",
  "stamp",
  "crop",
  "redact",
]);
const isTextShape = (shape) => textShapeTypes.has(shape.type);
const shapeLabel = (shape) =>
  shape.type === "watermark" ? "watermark" : shape.type;
const rotationTransform = (shape) =>
  shape.rotation
    ? `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`
    : undefined;

const defaultShape = (tool, point, pageNumber) => {
  const common = {
    id: crypto.randomUUID(),
    page_number: pageNumber,
    color: "#dc2626",
    fill_color: "",
    stroke_width: 3,
    opacity: 1,
    rotation: 0,
  };
  if (textShapeTypes.has(tool))
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
  if (tool === "redact")
    return {
      ...common,
      type: tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      redaction_mode: "black",
      replacement_text: "",
      replacement_color: "#111827",
      font_size: 14,
    };
  return {
    ...common,
    type: tool,
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
    ...(tool === "highlight" ? { fill_color: "#fde047", opacity: 0.35 } : {}),
  };
};

const Shape = ({ shape, editable, onPointerDown, onSelect }) => {
  const stroke = shape.color || "#dc2626";
  const props = {
    onPointerDown,
    onKeyDown: (event) => {
      if (editable && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        onSelect(shape.id);
      }
    },
    tabIndex: editable ? 0 : undefined,
    role: editable ? "button" : undefined,
    "aria-label": `${shapeLabel(shape)} object`,
    style: {
      pointerEvents: editable ? "all" : "none",
      cursor: editable ? "move" : undefined,
      touchAction: "none",
    },
  };
  const opacity = shape.opacity ?? 1;
  if (shape.type === "pen")
    return (
      <g {...props}>
        <polyline
          points={(shape.points || [])
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(12, shape.stroke_width || 3)}
        />
        <polyline
          points={(shape.points || [])
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={shape.stroke_width || 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      </g>
    );
  if (shape.type === "arrow") {
    const angle = Math.atan2(shape.y2 - shape.y, shape.x2 - shape.x);
    const size = Math.max((shape.stroke_width || 3) * 4, 10);
    const points = [
      [shape.x2, shape.y2],
      [
        shape.x2 - size * Math.cos(angle - Math.PI / 6),
        shape.y2 - size * Math.sin(angle - Math.PI / 6),
      ],
      [
        shape.x2 - size * Math.cos(angle + Math.PI / 6),
        shape.y2 - size * Math.sin(angle + Math.PI / 6),
      ],
    ];
    return (
      <g {...props}>
        <line
          x1={shape.x}
          y1={shape.y}
          x2={shape.x2}
          y2={shape.y2}
          stroke="transparent"
          strokeWidth={Math.max(12, shape.stroke_width || 3)}
        />
        <g opacity={opacity}>
          <line
            x1={shape.x}
            y1={shape.y}
            x2={shape.x2}
            y2={shape.y2}
            stroke={stroke}
            strokeWidth={shape.stroke_width || 3}
            strokeLinecap="round"
          />
          <polygon
            points={points.map((point) => point.join(",")).join(" ")}
            fill={stroke}
          />
        </g>
      </g>
    );
  }
  const isImage = imageShapeTypes.has(shape.type);
  const source = shape.preview_url || shape.asset_url;
  const redaction = shape.type === "redact";
  const mode = shape.redaction_mode || "black";
  const redactionColor = shape.replacement_color || "#111827";
  const replacementFontSize = Math.max(
    6,
    Math.min(shape.font_size || 14, Math.max(6, shape.height - 4)),
  );
  const fill = redaction
    ? mode === "black"
      ? "#000000"
      : ["blank", "replace"].includes(mode)
        ? "#ffffff"
        : "transparent"
    : isImage || ["strike", "strikethrough"].includes(shape.type)
      ? "transparent"
      : shape.fill_color ||
        (shape.type === "highlight" ? "#fde047" : "transparent");
  return (
    <g {...props} transform={rotationTransform(shape)}>
      {isImage && source ? (
        <image
          href={source}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          preserveAspectRatio="xMinYMin meet"
          opacity={opacity}
        />
      ) : null}
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={fill}
        stroke={
          redaction
            ? mode === "black"
              ? "#000000"
              : mode === "strike"
                ? "none"
                : "#94a3b8"
            : isImage
              ? source
                ? "none"
                : "#94a3b8"
              : ["highlight", "strike", "strikethrough"].includes(shape.type)
                ? "none"
                : stroke
        }
        strokeWidth={shape.stroke_width || 3}
        strokeDasharray={
          shape.type === "crop" || (isImage && !source) ? "8 5" : undefined
        }
        opacity={redaction ? 1 : opacity}
      />
      {isImage && !source ? (
        <text x={shape.x + 8} y={shape.y + 20} fill="#64748b" fontSize="12">
          Choose an image
        </text>
      ) : null}
      {["strike", "strikethrough"].includes(shape.type) ? (
        <line
          x1={shape.x}
          y1={shape.y + shape.height / 2}
          x2={shape.x + shape.width}
          y2={shape.y + shape.height / 2}
          stroke={stroke}
          strokeWidth={shape.stroke_width || 3}
          opacity={opacity}
        />
      ) : null}
      {redaction && mode === "strike" ? (
        <line
          x1={shape.x}
          y1={shape.y + shape.height / 2}
          x2={shape.x + shape.width}
          y2={shape.y + shape.height / 2}
          stroke={redactionColor}
          strokeWidth={shape.stroke_width || 3}
        />
      ) : null}
      {redaction && mode === "replace" && shape.replacement_text ? (
        <text
          x={shape.x + 3}
          y={shape.y + shape.height / 2 + replacementFontSize * 0.34}
          fill={redactionColor}
          fontFamily="DejaVu Sans, sans-serif"
          fontSize={replacementFontSize}
        >
          {shape.replacement_text}
        </text>
      ) : null}
    </g>
  );
};

const ResizeHandles = ({ shape, scale, onResizeStart, onResizeKey }) => (
  <div
    className="pointer-events-none absolute"
    style={{
      left: shape.x * scale,
      top: shape.y * scale,
      width: shape.width * scale,
      height: shape.height * scale,
      transform: `rotate(${Number(shape.rotation) || 0}deg)`,
    }}
  >
    {["nw", "ne", "sw", "se"].map((corner) => (
      <button
        key={corner}
        type="button"
        aria-label={`Resize ${shapeLabel(shape)} from ${corner}`}
        className="pointer-events-auto absolute z-20 h-6 w-6 touch-none rounded-full border-2 border-indigo-500 bg-white shadow-sm"
        style={{
          left: corner.includes("w") ? 0 : "100%",
          top: corner.includes("n") ? 0 : "100%",
          transform: "translate(-50%, -50%)",
          cursor: ["nw", "se"].includes(corner) ? "nwse-resize" : "nesw-resize",
        }}
        onPointerDown={(event) => onResizeStart(event, shape, corner)}
        onKeyDown={(event) => onResizeKey(event, shape, corner)}
      />
    ))}
  </div>
);

const TextShapeOverlay = ({
  shape,
  selected,
  highlighted,
  scale,
  editable,
  onDragStart,
  onSelect,
  onTextChange,
  ariaLabel,
  fontWeight = 700,
  textAlign = "left",
}) => {
  const textareaRef = useRef(null);
  const measureContextRef = useRef(null);
  const requestedSize = Number(shape.font_size) || 18;
  const [appearance, setAppearance] = useState({
    size: requestedSize,
    baselineOffset: 0,
  });
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return undefined;
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      let size = requestedSize;
      const previousHeight = textarea.style.height;
      const tooLarge = () => {
        const lineHeight = size * 1.199 + requestedSize * 0.15;
        textarea.style.fontSize = `${size * scale}px`;
        textarea.style.lineHeight = `${lineHeight * scale}px`;
        // Prawn places the first baseline at its OS/2 ascender, and measures
        // the last line through its descender rather than a full line box.
        textarea.style.height = "0px";
        const textHeight =
          textarea.scrollHeight - (lineHeight - size * 0.999) * scale;
        return (
          textHeight > shape.height * scale + 1 ||
          textarea.scrollWidth > textarea.clientWidth + 1
        );
      };
      if (textarea.clientWidth) {
        while (size > 6 && tooLarge()) size = Math.max(6, size - 0.5);
      }
      textarea.style.height = previousHeight;
      let ascender = size * 0.928;
      let descender = size * 0.236;
      if (typeof CanvasRenderingContext2D !== "undefined") {
        measureContextRef.current ||= document
          .createElement("canvas")
          .getContext("2d");
        const context = measureContextRef.current;
        if (context) {
          context.font = `${fontWeight} ${size}px "DejaVu Sans"`;
          const metrics = context.measureText("Hg");
          ascender = metrics.fontBoundingBoxAscent ?? ascender;
          descender = metrics.fontBoundingBoxDescent ?? descender;
        }
      }
      const lineHeight = size * 1.199 + requestedSize * 0.15;
      const baselineOffset =
        ascender + (lineHeight - ascender - descender) / 2 - size * 0.759;
      setAppearance({ size, baselineOffset });
    };
    fit();
    document.fonts?.ready?.then(fit);
    return () => {
      cancelled = true;
    };
  }, [shape.text, requestedSize, shape.width, shape.height, scale, fontWeight]);
  useEffect(() => {
    if (selected && editable)
      textareaRef.current?.focus({ preventScroll: true });
  }, [selected, editable, shape.id]);
  return (
    <div
      data-testid={`pdf-text-shape-${shape.id}`}
      data-pdf-object-id={shape.id}
      className={`absolute ${editable ? "pointer-events-auto" : "pointer-events-none"} ${selected ? "ring-2 ring-indigo-500" : highlighted ? "ring-2 ring-amber-500" : "ring-1 ring-transparent hover:ring-indigo-300"}`}
      style={{
        left: shape.x * scale,
        top: shape.y * scale,
        width: shape.width * scale,
        height: shape.height * scale,
        transform: `rotate(${Number(shape.rotation) || 0}deg)`,
        background: highlighted ? "rgba(250, 204, 21, 0.2)" : "transparent",
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (editable) onSelect(shape.id);
      }}
    >
      {selected && editable ? (
        <button
          type="button"
          aria-label={`Move ${shapeLabel(shape)} box`}
          className="absolute -left-3 -top-3 z-20 flex h-6 w-6 cursor-move touch-none items-center justify-center rounded-md border border-indigo-200 bg-white text-indigo-600 shadow-sm"
          onPointerDown={(event) => onDragStart(event, shape)}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div className="h-full w-full overflow-hidden">
        <textarea
          ref={textareaRef}
          value={shape.text || ""}
          readOnly={!editable}
          aria-label={ariaLabel || `${shapeLabel(shape)} content`}
          tabIndex={editable ? undefined : -1}
          onChange={(event) => {
            if (editable) onTextChange(shape.id, event.target.value);
          }}
          onFocus={() => {
            if (editable) onSelect(shape.id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (editable) onSelect(shape.id);
          }}
          className="h-full w-full resize-none overflow-hidden border-0 outline-none"
          style={{
            color: shape.color || "#111827",
            background: "transparent",
            fontFamily: '"DejaVu Sans", sans-serif',
            fontWeight,
            fontKerning: "none",
            fontVariantLigatures: "none",
            textAlign,
            fontSize: appearance.size * scale,
            padding: `${4 * scale}px`,
            lineHeight:
              (appearance.size * 1.199 + requestedSize * 0.15) * scale,
            height: `calc(100% + ${appearance.baselineOffset * scale}px)`,
            transform: `translateY(${-appearance.baselineOffset * scale}px)`,
            opacity: shape.opacity ?? 1,
            boxSizing: "border-box",
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

const PageNumberPreview = ({
  rule,
  pageNumber,
  pageCount,
  scale,
  pageSize,
  highlighted,
}) => {
  if (
    rule.page_numbers?.length &&
    !rule.page_numbers.map(Number).includes(pageNumber)
  )
    return null;
  const text = pdfPageNumberText(rule, pageNumber, pageCount);
  const position = rule.position || "bottom-center";
  const margin = Math.min(
    Number(rule.margin ?? 24),
    pageSize.width / 4,
    pageSize.height / 4,
  );
  const fontSize = Number(rule.font_size ?? 12);
  const align = position.split("-")[1];
  const width = Math.min(200, pageSize.width - margin * 2);
  const height = Math.min(fontSize * 1.8, pageSize.height - margin * 2);
  const shape = {
    ...rule,
    text,
    width,
    height,
    font_size: fontSize,
    x:
      align === "left"
        ? margin
        : align === "right"
          ? pageSize.width - margin - width
          : (pageSize.width - width) / 2,
    y: position.startsWith("top") ? margin : pageSize.height - margin - height,
  };
  return (
    <TextShapeOverlay
      shape={shape}
      scale={scale}
      highlighted={highlighted}
      editable={false}
      ariaLabel={`Page number: ${text}`}
      fontWeight={400}
      textAlign={align}
    />
  );
};

const PdfDocumentCanvas = ({
  documentRecord,
  pageNumber,
  zoom = 1,
  zoomMode = "custom",
  activeTool,
  shapes = [],
  setShapes,
  selectedShapeId,
  setSelectedShapeId,
  onDocumentLoaded,
  onPageLoaded,
  editable = true,
  onGestureEnd,
  onGestureStart,
  onGestureCancel,
  findOpen = false,
  findMatches = [],
  findMatch = null,
  activeFindMatchId,
}) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const gestureRef = useRef(null);
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const callbackRef = useRef(onGestureEnd);
  callbackRef.current = onGestureEnd;
  const gestureCallbacksRef = useRef({
    start: onGestureStart,
    cancel: onGestureCancel,
  });
  gestureCallbacksRef.current = {
    start: onGestureStart,
    cancel: onGestureCancel,
  };
  const pageSizeRef = useRef({ width: 612, height: 792 });
  const loadedPageRef = useRef(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 1000,
  });
  const [pageSize, setPageSize] = useState(pageSizeRef.current);
  const [renderedKey, setRenderedKey] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [completedGesture, setCompletedGesture] = useState(0);
  const [cancelledGesture, setCancelledGesture] = useState(0);
  const backgroundId =
    documentRecord?.background_version_id ||
    documentRecord?.editor_state?.background_version_id ||
    documentRecord?.current_version_id;
  const documentKey = `${documentRecord?.id}-${backgroundId}-${documentRecord?.content_url}-${retry}`;
  const pageKey = `${documentKey}-${pageNumber}`;
  const fitWidth = Math.max(1, containerSize.width);
  const renderWidth =
    zoomMode === "fit-page"
      ? Math.max(
          1,
          Math.min(
            fitWidth,
            (containerSize.height * pageSize.width) / pageSize.height,
          ),
        )
      : zoomMode === "fit-width"
        ? fitWidth
        : fitWidth * Math.max(0.1, Number(zoom) || 1);
  const scale = renderWidth / pageSize.width;
  const renderHeight = pageSize.height * scale;
  const renderKey = `${documentKey}-${pageNumber}-${renderWidth}`;
  const requestRef = useRef({ documentKey, pageKey, renderKey });
  requestRef.current = { documentKey, pageKey, renderKey };
  const ready = loadedKey === pageKey && renderedKey === renderKey && !error;
  const canEdit = editable && ready;
  const drawing = canEdit && drawingTools.has(activeTool);
  const pageShapes = useMemo(
    () =>
      shapes.filter(
        (shape) =>
          Number(shape.page_number) === pageNumber &&
          shape.type !== "page_number",
      ),
    [shapes, pageNumber],
  );
  const selectedShape = pageShapes.find(
    (shape) => shape.id === selectedShapeId,
  );
  const selectedMatchId = activeFindMatchId || findMatch?.id;
  const matchesOnPage = useMemo(
    () =>
      findMatches.filter((match) => Number(match.pageNumber) === pageNumber),
    [findMatches, pageNumber],
  );
  const textRenderer = useCallback(
    ({ str, itemIndex }) =>
      renderPdfTextItem(
        str,
        matchesOnPage.flatMap((match) =>
          (match.itemSlices?.[itemIndex] || []).map((slice) => ({
            ...slice,
            matchId: match.id,
            active: match.id === selectedMatchId,
          })),
        ),
      ),
    [matchesOnPage, selectedMatchId],
  );

  useEffect(() => {
    setError("");
  }, [documentKey]);
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!completedGesture) return;
    // Wait until the parent has received the final object state before requesting its save.
    queueMicrotask(() => callbackRef.current?.(shapesRef.current));
  }, [completedGesture]);
  useEffect(() => {
    if (cancelledGesture)
      queueMicrotask(() =>
        gestureCallbacksRef.current.cancel?.(shapesRef.current),
      );
  }, [cancelledGesture]);

  const releasePointer = useCallback((pointerId) => {
    const svg = svgRef.current;
    if (pointerId === undefined || !svg?.releasePointerCapture) return;
    try {
      if (!svg.hasPointerCapture || svg.hasPointerCapture(pointerId))
        svg.releasePointerCapture(pointerId);
    } catch {
      /* Already released by the browser. */
    }
  }, []);
  const capturePointer = (pointerId) => {
    if (pointerId === undefined || !svgRef.current?.setPointerCapture) return;
    try {
      svgRef.current.setPointerCapture(pointerId);
    } catch {
      /* Window tracking also supports drag outside the page. */
    }
  };
  const updateShape = useCallback(
    (id, nextShape) => {
      setShapes((current) =>
        current.map((shape) =>
          shape.id === id
            ? typeof nextShape === "function"
              ? nextShape(shape)
              : { ...shape, ...nextShape }
            : shape,
        ),
      );
    },
    [setShapes],
  );
  const cancelGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    releasePointer(gesture.pointerId);
    if (gesture.kind === "draw") {
      setShapes((current) =>
        current.filter((shape) => shape.id !== gesture.id),
      );
      setSelectedShapeId(null);
    } else updateShape(gesture.id, gesture.original);
    setCancelledGesture((value) => value + 1);
  }, [releasePointer, setShapes, setSelectedShapeId, updateShape]);
  const cancelGestureRef = useRef(cancelGesture);
  cancelGestureRef.current = cancelGesture;
  useEffect(() => {
    cancelGestureRef.current();
  }, [documentKey, pageNumber, activeTool, editable, renderWidth]);
  useEffect(
    () => () => {
      releasePointer(gestureRef.current?.pointerId);
      gestureRef.current = null;
    },
    [releasePointer],
  );

  const pointerPoint = useCallback((event) => {
    if (!svgRef.current) return null;
    const bounds = svgRef.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return screenPointToPdf({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds,
      pageWidth: pageSizeRef.current.width,
      pageHeight: pageSizeRef.current.height,
    });
  }, []);
  const handlePointerDown = (event) => {
    if (
      !canEdit ||
      gestureRef.current ||
      (event.button !== undefined && event.button !== 0)
    )
      return;
    if (!drawingTools.has(activeTool)) {
      setSelectedShapeId(null);
      return;
    }
    const start = pointerPoint(event);
    if (!start) return;
    event.preventDefault();
    gestureCallbacksRef.current.start?.();
    let shape = defaultShape(activeTool, start, pageNumber);
    if (isTextShape(shape)) {
      shape = boundPdfShape(shape, pageSize.width, pageSize.height);
      setShapes((current) => [...current, shape]);
      setSelectedShapeId(shape.id);
      setCompletedGesture((value) => value + 1);
      return;
    }
    if (activeTool === "pen") shape.points = [start];
    if (activeTool === "arrow")
      Object.assign(shape, { x2: start.x, y2: start.y });
    setShapes((current) => [...current, shape]);
    setSelectedShapeId(shape.id);
    capturePointer(event.pointerId);
    gestureRef.current = {
      kind: "draw",
      id: shape.id,
      pointerId: event.pointerId,
      start,
      current: shape,
      changed: false,
    };
  };
  const startManipulation = (event, shape, kind, handle) => {
    event.stopPropagation();
    if (
      !canEdit ||
      gestureRef.current ||
      (event.button !== undefined && event.button !== 0)
    )
      return;
    event.preventDefault();
    const start = pointerPoint(event);
    if (!start) return;
    gestureCallbacksRef.current.start?.();
    setSelectedShapeId(shape.id);
    capturePointer(event.pointerId);
    gestureRef.current = {
      kind,
      handle,
      id: shape.id,
      pointerId: event.pointerId,
      start,
      original: shape,
      current: shape,
      changed: false,
    };
  };
  const resizeWithKeyboard = (event, shape, corner) => {
    if (
      !canEdit ||
      gestureRef.current ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    gestureCallbacksRef.current.start?.();
    const delta = event.shiftKey ? 10 : 1;
    const angle = ((Number(shape.rotation) || 0) * Math.PI) / 180;
    const localX = ((corner.includes("w") ? -1 : 1) * shape.width) / 2;
    const localY = ((corner.includes("n") ? -1 : 1) * shape.height) / 2;
    const point = {
      x:
        shape.x +
        shape.width / 2 +
        localX * Math.cos(angle) -
        localY * Math.sin(angle) +
        (event.key === "ArrowRight"
          ? delta
          : event.key === "ArrowLeft"
            ? -delta
            : 0),
      y:
        shape.y +
        shape.height / 2 +
        localX * Math.sin(angle) +
        localY * Math.cos(angle) +
        (event.key === "ArrowDown"
          ? delta
          : event.key === "ArrowUp"
            ? -delta
            : 0),
    };
    updateShape(
      shape.id,
      resizePdfShape(
        shape,
        point,
        corner,
        pageSize.width,
        pageSize.height,
        imageShapeTypes.has(shape.type),
      ),
    );
    setCompletedGesture((value) => value + 1);
  };
  const handlePointerMove = useCallback(
    (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const point = pointerPoint(event);
      if (!point) return;
      const size = pageSizeRef.current;
      let next;
      if (gesture.kind === "drag")
        next = movePdfShape(
          gesture.original,
          point.x - gesture.start.x,
          point.y - gesture.start.y,
          size.width,
          size.height,
        );
      else if (gesture.kind === "resize")
        next = resizePdfShape(
          gesture.original,
          point,
          gesture.handle,
          size.width,
          size.height,
          imageShapeTypes.has(gesture.original.type),
        );
      else if (gesture.current.type === "pen") {
        const last = gesture.current.points.at(-1);
        if (Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
        next = {
          ...gesture.current,
          points: appendPdfPenPoint(gesture.current.points, point),
        };
      } else if (gesture.current.type === "arrow")
        next = { ...gesture.current, x2: point.x, y2: point.y };
      else {
        const current =
          shapesRef.current.find((shape) => shape.id === gesture.id) ||
          gesture.current;
        const rectangle = imageShapeTypes.has(current.type)
          ? proportionalRectangle(
              gesture.start,
              point,
              current.aspect_ratio,
              size.width,
              size.height,
            )
          : normalizedRectangle(gesture.start, point);
        next = { ...current, ...rectangle };
      }
      gesture.changed =
        JSON.stringify(next) !==
          JSON.stringify(gesture.original || gesture.current) ||
        gesture.changed;
      gesture.current = next;
      updateShape(gesture.id, next);
    },
    [pointerPoint, updateShape],
  );
  const finishGesture = useCallback(
    (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (event.type === "pointercancel") {
        cancelGesture();
        return;
      }
      // Fast pointer gestures may release before their final move is dispatched.
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY))
        handlePointerMove(event);
      gestureRef.current = null;
      releasePointer(gesture.pointerId);
      if (gesture.kind === "draw" && !isValidPdfShape(gesture.current)) {
        setShapes((current) =>
          current.filter((shape) => shape.id !== gesture.id),
        );
        setSelectedShapeId(null);
        setCancelledGesture((value) => value + 1);
        return;
      }
      if (gesture.changed) setCompletedGesture((value) => value + 1);
      else setCancelledGesture((value) => value + 1);
    },
    [
      cancelGesture,
      handlePointerMove,
      releasePointer,
      setShapes,
      setSelectedShapeId,
    ],
  );
  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishGesture);
    window.addEventListener("pointercancel", finishGesture);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishGesture);
      window.removeEventListener("pointercancel", finishGesture);
    };
  }, [handlePointerMove, finishGesture]);
  useEffect(() => {
    const cancelOnEscape = (event) => {
      if (event.key !== "Escape" || !gestureRef.current) return;
      event.preventDefault();
      cancelGesture();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelGesture]);

  const scrollToFindMatch = useCallback(() => {
    if (
      !findOpen ||
      !findMatch ||
      findMatch.pageNumber !== pageNumber ||
      !containerRef.current
    )
      return;
    const target = findMatch.objectId
      ? Array.from(
          containerRef.current.querySelectorAll("[data-pdf-object-id]"),
        ).find((node) => node.dataset.pdfObjectId === findMatch.objectId)
      : Array.from(
          containerRef.current.querySelectorAll("[data-pdf-find-id]"),
        ).find((node) => node.dataset.pdfFindId === findMatch.id);
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    const container = containerRef.current;
    const containerBounds = container.getBoundingClientRect();
    container.scrollTo?.({
      top:
        container.scrollTop +
        bounds.top -
        containerBounds.top -
        container.clientHeight / 2 +
        bounds.height / 2,
      left:
        container.scrollLeft +
        bounds.left -
        containerBounds.left -
        container.clientWidth / 2 +
        bounds.width / 2,
      behavior: "auto",
    });
  }, [findOpen, findMatch, pageNumber]);
  useEffect(() => {
    if (ready && findMatch?.objectId) scrollToFindMatch();
  }, [ready, findMatch, scrollToFindMatch]);

  if (!documentRecord) return null;
  return (
    <div
      ref={containerRef}
      className="nexus-pdf-canvas h-full min-h-0 w-full overflow-auto bg-slate-100/80 p-2 sm:p-4 md:p-8"
      aria-label="PDF document viewer"
    >
      {error ? (
        <div
          className="mx-auto max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700"
          role="alert"
        >
          <AlertTriangle className="mx-auto mb-3 h-8 w-8" />
          <p className="font-bold">This PDF could not be displayed.</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            type="button"
            className="mt-4 underline"
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Retry preview
          </button>
        </div>
      ) : (
        <div
          className="nexus-pdf-page relative mx-auto shrink-0 overflow-hidden bg-white shadow-xl shadow-slate-900/15"
          style={{ width: renderWidth, height: renderHeight }}
        >
          <Document
            key={documentKey}
            file={`${documentRecord.content_url}${documentRecord.content_url?.includes("?") ? "&" : "?"}version=${backgroundId}`}
            onLoadSuccess={(value) => {
              if (requestRef.current.documentKey === documentKey) {
                setError("");
                onDocumentLoaded?.(value.numPages, value);
              }
            }}
            onLoadError={(value) => {
              if (requestRef.current.documentKey === documentKey)
                setError(value?.message || "Unable to load PDF.");
            }}
            loading={
              <div
                className="flex h-full items-center justify-center"
                role="status"
                aria-label="Loading PDF"
              >
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            }
          >
            <Page
              key={pageKey}
              pageNumber={pageNumber}
              width={renderWidth}
              renderTextLayer={findOpen}
              customTextRenderer={textRenderer}
              renderAnnotationLayer={false}
              onRenderTextLayerSuccess={scrollToFindMatch}
              onLoadSuccess={(page) => {
                if (pageKey !== requestRef.current.pageKey) return;
                const viewport = editorPageViewport(page);
                const next = { width: viewport.width, height: viewport.height };
                if (
                  ![next.width, next.height].every(
                    (value) => Number.isFinite(value) && value > 0,
                  )
                ) {
                  setError("This PDF page has invalid dimensions.");
                  return;
                }
                loadedPageRef.current = { key: pageKey, viewport };
                setLoadedKey(pageKey);
                pageSizeRef.current = next;
                setPageSize((current) =>
                  current.width === next.width && current.height === next.height
                    ? current
                    : next,
                );
                onPageLoaded?.(next);
              }}
              onRenderSuccess={() => {
                if (
                  requestRef.current.renderKey === renderKey &&
                  loadedPageRef.current?.key === pageKey
                )
                  setRenderedKey(renderKey);
              }}
              onLoadError={(value) => {
                if (requestRef.current.pageKey === pageKey)
                  setError(value?.message || "Unable to load this page.");
              }}
              onRenderError={(value) => {
                if (requestRef.current.renderKey === renderKey)
                  setError(value?.message || "Unable to render this page.");
              }}
            />
          </Document>
          <svg
            ref={svgRef}
            data-testid="pdf-edit-layer"
            viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
            className="absolute inset-0 h-full w-full"
            style={{
              zIndex: 3,
              touchAction: drawing ? "none" : "auto",
              pointerEvents: ready ? "auto" : "none",
              cursor: drawing ? "crosshair" : "default",
            }}
            onPointerDown={handlePointerDown}
          ></svg>
          <div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: 4 }}
          >
            {pageShapes.map((shape) =>
              isTextShape(shape) ? (
                <TextShapeOverlay
                  key={shape.id}
                  shape={shape}
                  selected={shape.id === selectedShapeId}
                  highlighted={findOpen && findMatch?.objectId === shape.id}
                  scale={scale}
                  editable={canEdit}
                  onDragStart={(event, current) =>
                    startManipulation(event, current, "drag")
                  }
                  onSelect={setSelectedShapeId}
                  onTextChange={(id, text) =>
                    updateShape(id, (current) => ({ ...current, text }))
                  }
                />
              ) : (
                <svg
                  key={shape.id}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                >
                  <Shape
                    shape={shape}
                    editable={canEdit}
                    onSelect={setSelectedShapeId}
                    onPointerDown={(event) =>
                      startManipulation(event, shape, "drag")
                    }
                  />
                </svg>
              ),
            )}
            {selectedShape && !isTextShape(selectedShape)
              ? (() => {
                  const bounds = ["pen", "arrow"].includes(selectedShape.type)
                    ? getPdfShapeBounds(selectedShape)
                    : selectedShape;
                  return (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                    >
                      <rect
                        x={bounds.x}
                        y={bounds.y}
                        width={Math.max(2, bounds.width)}
                        height={Math.max(2, bounds.height)}
                        transform={rotationTransform(selectedShape)}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="5 3"
                      />
                    </svg>
                  );
                })()
              : null}
            {shapes
              .filter((shape) => shape.type === "page_number")
              .map((rule) => (
                <PageNumberPreview
                  key={rule.id}
                  rule={rule}
                  pageNumber={pageNumber}
                  pageCount={documentRecord.page_count || 1}
                  scale={scale}
                  pageSize={pageSize}
                  highlighted={
                    findOpen &&
                    findMatch?.objectId === rule.id &&
                    findMatch.pageNumber === pageNumber
                  }
                />
              ))}
            {canEdit &&
            selectedShape &&
            !["pen", "arrow"].includes(selectedShape.type) ? (
              <ResizeHandles
                shape={selectedShape}
                scale={scale}
                onResizeStart={(event, shape, corner) =>
                  startManipulation(event, shape, "resize", corner)
                }
                onResizeKey={resizeWithKeyboard}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfDocumentCanvas;
