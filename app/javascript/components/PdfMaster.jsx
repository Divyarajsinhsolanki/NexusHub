import React, {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { createPortal } from "react-dom";
import { Document, Page } from "react-pdf";
import { useDropzone } from "react-dropzone";
import { toast } from "react-hot-toast";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  Eraser,
  FileArchive,
  FilePlus2,
  FileText,
  GripVertical,
  Hash,
  Highlighter,
  Image,
  Images,
  Library,
  Loader2,
  Lock,
  Merge,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Shield,
  Square,
  Stamp,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import {
  createPdfDocumentOperation,
  deletePdfDocument,
  fetchPdfDocument,
  fetchPdfDocumentOperations,
  fetchPdfDocumentOperation,
  fetchPdfDocuments,
  redoPdfDocument,
  renamePdfDocument,
  restorePdfDocument,
  undoPdfDocument,
  uploadPdfDocument,
} from "./api";
import PdfDocumentCanvas from "./PdfDocumentCanvas";
import SignatureDialog from "./pdf/SignatureDialog";
import PdfFindBar from "./pdf/PdfFindBar";
import { searchPdfDocument } from "../utils/pdfSearch";
import usePdfAutosave from "../hooks/usePdfAutosave";
import { boundPdfShape, movePdfShape } from "../utils/pdfCoordinates";

const SAMPLE = {
  id: "demo",
  title: "Nexus Hub sample",
  original_filename: "nexus-hub-sample.pdf",
  page_count: 1,
  current_version_id: "demo",
  content_url: "/demo/nexus-hub-sample.pdf",
  download_url: "/demo/nexus-hub-sample.pdf",
  encrypted: false,
};
const GROUPS = [
  ["edit", "Edit", Type],
  ["annotate", "Annotate", Highlighter],
  ["pages", "Pages", Images],
  ["secure", "Secure", Shield],
  ["export", "Export", Download],
];
const TOOLS = {
  edit: [
    ["text", "Text", Type],
    ["image", "Image", Image],
    ["signature", "Signature", PenLine],
    ["stamp", "Stamp", Stamp],
  ],
  annotate: [
    ["highlight", "Highlight", Highlighter],
    ["pen", "Pen", PenLine],
    ["rectangle", "Rectangle", Square],
    ["arrow", "Arrow", ArrowRight],
    ["strike", "Strikethrough", Minus],
    ["watermark", "Watermark", Stamp],
  ],
  pages: [["crop", "Crop", Crop]],
  secure: [["redact", "Redact", Eraser]],
  export: [],
};
const IMAGE_TYPES = ["image", "signature", "stamp"];
const TRANSIENT_TYPES = ["crop", "redact"];
const labelFor = (shape) =>
  shape.type === "page_number"
    ? "Page numbers"
    : shape.type[0].toUpperCase() + shape.type.slice(1);
const bytes = (n = 0) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : n < 1024 ** 3
        ? `${(n / 1024 ** 2).toFixed(1)} MB`
        : n < 1024 ** 4
          ? `${(n / 1024 ** 3).toFixed(1)} GB`
          : `${(n / 1024 ** 4).toFixed(1)} TB`;
const message = (e) =>
  e?.response?.data?.error ||
  e?.response?.data?.errors?.join?.(", ") ||
  e?.message ||
  "The PDF action failed.";
const invoke = (fn) => () =>
  Promise.resolve()
    .then(fn)
    .catch(() => {});
const backgroundKey = (doc) =>
  [
    doc?.id,
    doc?.editor_state?.layer_id || doc?.current_version_id,
    doc?.editor_state?.background_url || doc?.content_url,
  ].join(":");
const cleanObjects = (objects) =>
  objects.map(
    ({ asset_url, preview_url, canonical_geometry, ...shape }) => shape,
  );

export function parsePageRange(input, count) {
  if (!input.trim()) return [];
  const pages = new Set();
  for (const token of input.split(",")) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error("Use page numbers or ranges, for example 1-3, 5.");
    const first = Number(match[1]),
      last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > count)
      throw new Error(
        `Choose pages between 1 and ${count}, in ascending ranges.`,
      );
    for (let page = first; page <= last; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
function Button({
  icon: Icon,
  children,
  className = "",
  primary,
  danger,
  ...props
}) {
  return (
    <button
      type="button"
      className={`pdf-button ${primary ? "pdf-button-primary" : ""} ${danger ? "pdf-button-danger" : ""} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
function Field({ label, children, className = "" }) {
  const id = useId();
  return (
    <div className={`pdf-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {React.isValidElement(children) &&
      ["input", "select", "textarea"].includes(children.type)
        ? React.cloneElement(children, { id })
        : children}
    </div>
  );
}
function Section({ title, children }) {
  return (
    <section className="pdf-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Disclosure({ title, children }) {
  return (
    <details className="pdf-disclosure">
      <summary>
        {title}
        <ChevronDown size={15} />
      </summary>
      <div className="pdf-section-body">{children}</div>
    </details>
  );
}
function Modal({ open, title, onClose, children }) {
  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      className="nexus-pdf-panel-backdrop relative z-[80]"
    >
      <div className="fixed inset-0 bg-slate-950/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
        <DialogPanel className="pdf-modal">
          <header>
            <DialogTitle>{title}</DialogTitle>
            <Button aria-label={`Close ${title}`} onClick={onClose} icon={X} />
          </header>
          <div className="pdf-modal-body">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
function Thumbnail({ pageNumber }) {
  const ref = useRef(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || visible) return;
    if (!window.IntersectionObserver) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return (
    <div ref={ref} className="pdf-thumbnail">
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={108}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          error={<span>Page {pageNumber}</span>}
          loading={<Loader2 size={16} className="animate-spin" />}
        />
      ) : (
        <span>{pageNumber}</span>
      )}
    </div>
  );
}
function PageOrganizer({
  documentRecord,
  currentPage,
  selected,
  onSelect,
  onNavigate,
  onReorder,
  disabled,
}) {
  const [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const order = Array.from(
    { length: documentRecord.page_count || 0 },
    (_, i) => i + 1,
  );
  useEffect(
    () => setError(false),
    [documentRecord.id, documentRecord.current_version_id],
  );
  if (error)
    return (
      <div className="pdf-muted p-4">
        Page previews are unavailable.
        <Button
          onClick={() => {
            setError(false);
            setRetry((n) => n + 1);
          }}
        >
          Retry previews
        </Button>
      </div>
    );
  return (
    <Document
      key={`${documentRecord.current_version_id}-${retry}`}
      file={`${documentRecord.content_url}?version=${documentRecord.current_version_id}`}
      onLoadError={() => setError(true)}
      loading={<Loader2 className="m-auto animate-spin" size={20} />}
    >
      <DragDropContext
        onDragEnd={(result) => {
          if (
            disabled ||
            !result.destination ||
            result.source.index === result.destination.index
          )
            return;
          const next = [...order];
          next.splice(
            result.destination.index,
            0,
            next.splice(result.source.index, 1)[0],
          );
          onReorder(next);
        }}
      >
        <Droppable droppableId="pdf-pages">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="pdf-pages-list"
            >
              {order.map((page, index) => (
                <Draggable
                  key={page}
                  draggableId={`page-${page}`}
                  index={index}
                  isDragDisabled={disabled}
                >
                  {(drag, snapshot) => {
                    const card = (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        style={{
                          ...drag.draggableProps.style,
                          zIndex: snapshot.isDragging ? 9999 : undefined,
                        }}
                        className={`pdf-page-card ${currentPage === page ? "is-current" : ""} ${selected.has(page) ? "is-selected" : ""}`}
                      >
                        <div className="pdf-page-card-header">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={selected.has(page)}
                            onChange={() => onSelect(page)}
                            aria-label={`Select page ${page}`}
                          />
                          <span>Page {page}</span>
                          <button
                            type="button"
                            {...drag.dragHandleProps}
                            aria-label={`Move page ${page}`}
                            disabled={disabled}
                          >
                            <GripVertical size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate(page)}
                          aria-label={`View page ${page}`}
                          aria-current={
                            currentPage === page ? "page" : undefined
                          }
                        >
                          <Thumbnail pageNumber={page} />
                        </button>
                      </div>
                    );
                    return snapshot.isDragging
                      ? createPortal(card, document.body)
                      : card;
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </Document>
  );
}

export default function PdfMaster() {
  const { user } = useContext(AuthContext),
    demo = Boolean(user?.demo_account);
  const [documents, setDocuments] = useState(demo ? [SAMPLE] : []),
    [usage, setUsage] = useState({});
  const [selectedDocument, setSelectedDocument] = useState(
    demo ? SAMPLE : null,
  );
  const [loading, setLoading] = useState(!demo),
    [editorLoading, setEditorLoading] = useState(false),
    [libraryError, setLibraryError] = useState("");
  const [search, setSearch] = useState(""),
    [searching, setSearching] = useState(false),
    [uploading, setUploading] = useState(false),
    [uploadProgress, setUploadProgress] = useState(0);
  const [leftTab, setLeftTab] = useState("library"),
    [group, setGroup] = useState("edit"),
    [activeTool, setActiveTool] = useState("select"),
    [panel, setPanel] = useState(null);
  const [objects, setObjects] = useState([]),
    [regions, setRegions] = useState([]),
    [selectedShapeId, setSelectedShapeId] = useState(null),
    [assets, setAssets] = useState({}),
    [placementAsset, setPlacementAsset] = useState(null);
  const [currentPage, setCurrentPage] = useState(1),
    [selectedPages, setSelectedPages] = useState(new Set()),
    [rangeInput, setRangeInput] = useState("");
  const [zoom, setZoom] = useState(1),
    [zoomMode, setZoomMode] = useState("fit-width"),
    [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [interacting, setInteracting] = useState(false);
  const [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [operation, setOperation] = useState(null),
    [artifacts, setArtifacts] = useState([]),
    [recentOperations, setRecentOperations] = useState([]);
  const [mergeIds, setMergeIds] = useState([]),
    [mergeTitle, setMergeTitle] = useState("Merged document"),
    [splitMode, setSplitMode] = useState("ranges"),
    [splitSize, setSplitSize] = useState(10),
    [splitRows, setSplitRows] = useState(["1", "2"]);
  const [password, setPassword] = useState(""),
    [title, setTitle] = useState(""),
    [signatureOpen, setSignatureOpen] = useState(false),
    [confirmation, setConfirmation] = useState(null);
  const [findOpen, setFindOpen] = useState(false),
    [findQuery, setFindQuery] = useState(""),
    [pdfProxy, setPdfProxy] = useState(null),
    [findMatches, setFindMatches] = useState([]),
    [findIndex, setFindIndex] = useState(0),
    [findSearching, setFindSearching] = useState(false),
    [findError, setFindError] = useState("");
  const [pageScopeDraft, setPageScopeDraft] = useState(""),
    [pageScopeError, setPageScopeError] = useState("");
  const mounted = useRef(true),
    libraryRequest = useRef(0),
    editorRequest = useRef(0),
    documentRef = useRef(selectedDocument),
    objectsRef = useRef(objects),
    regionsRef = useRef(regions),
    operationRef = useRef(null),
    transitionRef = useRef(false),
    cropRequest = useRef(null),
    assetInput = useRef(null),
    assetType = useRef("image"),
    urls = useRef(new Set()),
    saveRef = useRef(null),
    lastSearch = useRef(""),
    findIdentity = useRef(""),
    findSelection = useRef(null);
  findSelection.current = findMatches[findIndex]?.id;
  documentRef.current = selectedDocument;
  objectsRef.current = objects;
  regionsRef.current = regions;
  const count = selectedDocument?.page_count || 0,
    pendingMutation = Boolean(
      operation &&
        ["queued", "processing"].includes(operation.status) &&
        ["compress", "redact"].includes(operation.kind) &&
        String(operation.pdf_document_id) === String(selectedDocument?.id),
    ),
    editable = Boolean(
      selectedDocument &&
        !demo &&
        !selectedDocument.encrypted &&
        !busy &&
        !preparing &&
        !pendingMutation &&
        !editorLoading,
    );
  const selectedNumbers = useMemo(
    () => [...selectedPages].sort((a, b) => a - b),
    [selectedPages],
  );
  const shapes = useMemo(() => [...objects, ...regions], [objects, regions]),
    selectedShape = shapes.find((s) => s.id === selectedShapeId);
  const savedObjects = useMemo(() => cleanObjects(objects), [objects]);
  const visibleOperations = recentOperations.filter(
    (item) => item.kind !== "save_objects",
  );
  useEffect(() => {
    setPageScopeDraft((selectedShape?.page_numbers || []).join(", "));
    setPageScopeError("");
  }, [selectedShape?.id, selectedShape?.page_numbers]);

  const updateDocument = useCallback((doc) => {
    if (!doc || !mounted.current) return;
    if (String(documentRef.current?.id) === String(doc.id)) {
      documentRef.current = doc;
      setSelectedDocument(doc);
    }
    setDocuments((rows) =>
      rows.map((row) =>
        String(row.id) === String(doc.id) ? { ...row, ...doc } : row,
      ),
    );
  }, []);
  const save = useCallback(
    async ({ objects: snapshot, assets: files, baseVersionId, documentId }) => {
      const { data } = await createPdfDocumentOperation(
        {
          kind: "save_objects",
          pdf_document_id: documentId,
          base_version_id: baseVersionId,
          parameters: { objects: snapshot },
        },
        Object.keys(files || {}).length ? files : undefined,
      );
      if (data.status === "failed")
        throw new Error(data.error || "Your changes could not be saved.");
      const acknowledgedVersion =
        data.result?.version_id ?? data.document.current_version_id;
      if (
        String(acknowledgedVersion) !== String(data.document.current_version_id)
      )
        throw new Error(
          "The document changed in another request while saving. Your edits are still here. Reload the saved version to review the latest changes.",
        );
      return { ...data, baseVersionId: acknowledgedVersion };
    },
    [],
  );
  const onSaved = useCallback(
    (result) => {
      const doc = result.document;
      if (
        !mounted.current ||
        String(doc?.id) !== String(documentRef.current?.id)
      )
        return;
      updateDocument({ ...doc, title: documentRef.current.title });
      const serverObjects = doc.editor_state?.objects || [];
      // Enrich previews without replacing changes made while the save was in flight.
      setObjects((current) =>
        current.map((shape) => {
          const persisted = serverObjects.find((s) => s.id === shape.id);
          return persisted &&
            String(persisted.asset_id) === String(shape.asset_id)
            ? { ...shape, asset_url: persisted.asset_url }
            : shape;
        }),
      );
    },
    [updateDocument],
  );
  const autosave = usePdfAutosave({
    documentId: selectedDocument?.id,
    baseVersionId: selectedDocument?.current_version_id,
    objects: savedObjects,
    assets,
    // Lock editing while a transition flushes, but let its pending save finish.
    enabled: Boolean(
      selectedDocument &&
        !demo &&
        !selectedDocument.encrypted &&
        !busy &&
        !pendingMutation &&
        !editorLoading &&
        !interacting,
    ),
    save,
    onSaved,
    onError: () => {},
  });
  saveRef.current = autosave;

  const beginTransition = useCallback(() => {
    if (transitionRef.current) return false;
    transitionRef.current = true;
    setPreparing(true);
    return true;
  }, []);
  const endTransition = useCallback(() => {
    transitionRef.current = false;
    if (mounted.current) setPreparing(false);
  }, []);

  const hydrate = useCallback((doc) => {
    const sameBackground =
      backgroundKey(doc) === backgroundKey(documentRef.current);
    setInteracting(false);
    documentRef.current = doc;
    setSelectedDocument(doc);
    setTitle(doc?.title || "");
    const next = doc?.editor_state?.objects || [];
    objectsRef.current = next;
    setObjects(next);
    regionsRef.current = [];
    setRegions([]);
    setSelectedShapeId(null);
    setAssets({});
    setPlacementAsset(null);
    setCurrentPage(1);
    setSelectedPages(new Set());
    setRangeInput("");
    setActiveTool("select");
    if (!sameBackground) setPdfProxy(null);
    setArtifacts(
      doc?.recent_operations?.flatMap((op) => op.artifacts || []) || [],
    );
    setRecentOperations(doc?.recent_operations || []);
    const latestOperation =
      doc?.recent_operations?.find((item) =>
        ["queued", "processing"].includes(item.status),
      ) ||
      doc?.recent_operations?.find((item) => item.kind !== "save_objects") ||
      null;
    setOperation(latestOperation);
    operationRef.current = latestOperation;
    saveRef.current?.reset(doc?.current_version_id, cleanObjects(next));
  }, []);
  const openDocument = useCallback(
    async (docOrId, { skipFlush = false } = {}) => {
      if (!skipFlush && !beginTransition()) return;
      let request;
      try {
        if (!skipFlush) {
          if (regionsRef.current.length)
            throw new Error(
              "Finish or clear the pending crop or redaction first.",
            );
          await saveRef.current?.flush();
        }
        request = ++editorRequest.current;
        const id = typeof docOrId === "object" ? docOrId.id : docOrId;
        setEditorLoading(true);
        const [detail, activity] = demo
          ? [{ data: SAMPLE }, { data: { operations: [] } }]
          : await Promise.all([
              fetchPdfDocument(id),
              fetchPdfDocumentOperations(id).catch(() => ({
                data: { operations: [] },
              })),
            ]);
        const doc = {
          ...detail.data,
          recent_operations: activity.data.operations || [],
        };
        if (!mounted.current || request !== editorRequest.current) return;
        hydrate(doc);
        setPanel(null);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("document_id", id);
          window.history.replaceState(window.history.state, "", url);
        }
      } catch (error) {
        toast.error(message(error));
        throw error;
      } finally {
        if (!skipFlush) endTransition();
        if (mounted.current && request === editorRequest.current)
          setEditorLoading(false);
      }
    },
    [demo, hydrate, beginTransition, endTransition],
  );
  const loadLibrary = useCallback(
    async (query = "") => {
      if (demo) return [SAMPLE];
      const request = ++libraryRequest.current;
      const { data } = await fetchPdfDocuments(
        query.trim() ? { q: query.trim() } : {},
      );
      if (mounted.current && request === libraryRequest.current) {
        setDocuments(data.documents || []);
        setUsage(data.usage || {});
        setLibraryError("");
      }
      return data.documents || [];
    },
    [demo],
  );
  useEffect(() => {
    mounted.current = true;
    if (!demo) {
      loadLibrary()
        .then(async (rows) => {
          const preferred = new URLSearchParams(window.location.search).get(
            "document_id",
          );
          if (preferred || rows[0])
            await openDocument(preferred || rows[0], { skipFlush: true });
        })
        .catch((e) => setLibraryError(message(e)))
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    }
    return () => {
      mounted.current = false;
      libraryRequest.current++;
      editorRequest.current++;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [demo, loadLibrary, openDocument]);
  useEffect(() => {
    if (demo || loading || search === lastSearch.current) return;
    const timer = window.setTimeout(() => {
      lastSearch.current = search;
      setSearching(true);
      loadLibrary(search)
        .catch((e) => toast.error(message(e)))
        .finally(() => {
          if (mounted.current) setSearching(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, demo, loading, loadLibrary]);
  useEffect(() => {
    const controller = new AbortController();
    if (!findOpen || !findQuery.trim() || !pdfProxy) {
      setFindMatches([]);
      setFindSearching(false);
      return () => controller.abort();
    }
    setFindSearching(true);
    setFindError("");
    const timer = window.setTimeout(() => {
      searchPdfDocument(pdfProxy, findQuery, {
        objects,
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            const matches = Array.isArray(result)
              ? result
              : result.matches || [];
            const identity = `${backgroundKey(documentRef.current)}:${findQuery.trim().toLowerCase()}`;
            const changed = findIdentity.current !== identity;
            findIdentity.current = identity;
            setFindMatches(matches);
            setFindIndex(
              changed
                ? 0
                : Math.max(
                    0,
                    matches.findIndex(
                      (match) => match.id === findSelection.current,
                    ),
                  ),
            );
            if (changed && matches[0]) setCurrentPage(matches[0].pageNumber);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setFindError(message(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setFindSearching(false);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [findOpen, findQuery, pdfProxy, objects]);
  const navigateFind = (index) => {
    if (!findMatches.length) return;
    const next = (index + findMatches.length) % findMatches.length;
    setFindIndex(next);
    setCurrentPage(findMatches[next].pageNumber);
  };

  const poll = useCallback(async (id) => {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (!mounted.current) return null;
      const { data } = await fetchPdfDocumentOperation(id);
      if (!mounted.current) return null;
      setOperation(data);
      operationRef.current = data;
      if (data.status === "failed")
        throw new Error(data.error || "PDF operation failed.");
      if (data.status === "completed") return data;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    throw new Error(
      "This operation is still running. Use Check status to retrieve its result.",
    );
  }, []);
  const finishOperation = useCallback(
    async (result) => {
      if (!result || !mounted.current) return;
      setOperation(result);
      operationRef.current = result;
      setArtifacts(result.artifacts || []);
      setRecentOperations((items) =>
        [result, ...items.filter((item) => item.id !== result.id)].slice(0, 10),
      );
      if (
        result.document &&
        String(result.document.id) === String(documentRef.current?.id)
      ) {
        updateDocument(result.document);
        hydrate({
          ...result.document,
          recent_operations: [
            result,
            ...recentOperations.filter((item) => item.id !== result.id),
          ].slice(0, 10),
        });
        setArtifacts(result.artifacts || []);
      }
      const rows = await loadLibrary(search);
      const resultId =
        result.result?.document_ids?.[0] || result.result?.document_id;
      if (resultId && String(resultId) !== String(documentRef.current?.id))
        await openDocument(
          rows.find((d) => String(d.id) === String(resultId)) || resultId,
          { skipFlush: true },
        );
      const createdIds =
        result.result?.document_ids ||
        (result.result?.document_id ? [result.result.document_id] : []);
      if (createdIds.length) {
        let resultRows = rows;
        if (
          createdIds.some(
            (id) => !rows.some((doc) => String(doc.id) === String(id)),
          )
        ) {
          const { data } = await fetchPdfDocuments();
          resultRows = data.documents || [];
        }
        setOperation(result);
        operationRef.current = result;
        setArtifacts([
          ...(result.artifacts || []),
          ...createdIds
            .map((id) => {
              const created = resultRows.find(
                (doc) => String(doc.id) === String(id),
              );
              return created
                ? {
                    id: `document-${id}`,
                    filename: `${created.title}.pdf`,
                    download_url: created.download_url,
                  }
                : null;
            })
            .filter(Boolean),
        ]);
      }
      toast.success(result.result?.message || "PDF operation completed.");
    },
    [
      hydrate,
      loadLibrary,
      openDocument,
      search,
      updateDocument,
      recentOperations,
    ],
  );
  const runOperation = async (kind, parameters = {}, options = {}) => {
    if (
      demo ||
      busy ||
      pendingMutation ||
      editorLoading ||
      transitionRef.current
    )
      return;
    if (interacting) {
      toast.error("Finish the current drawing or drag first.");
      return;
    }
    if (!beginTransition()) return;
    try {
      if (regionsRef.current.length && !["crop", "redact"].includes(kind))
        throw new Error("Finish or clear the pending crop or redaction first.");
      await autosave.flush();
      const doc = documentRef.current;
      setBusy(true);
      const payload = {
        kind,
        pdf_document_id: options.documentId === null ? undefined : doc?.id,
        base_version_id:
          options.documentId === null ? undefined : doc?.current_version_id,
        parameters,
        ...(options.password ? { password: options.password } : {}),
      };
      const { data } = await createPdfDocumentOperation(payload, options.asset);
      setOperation(data);
      operationRef.current = data;
      if (data.status === "failed")
        throw new Error(data.error || "PDF operation failed.");
      await finishOperation(
        data.status === "completed" ? data : await poll(data.id),
      );
    } catch (error) {
      toast.error(message(error));
      throw error;
    } finally {
      if (mounted.current) setBusy(false);
      endTransition();
    }
  };
  const history = async (direction) => {
    if (
      !selectedDocument ||
      demo ||
      busy ||
      pendingMutation ||
      interacting ||
      editorLoading ||
      !beginTransition()
    )
      return;
    try {
      if (regionsRef.current.length)
        throw new Error("Finish or clear the pending crop or redaction first.");
      await autosave.flush();
      setBusy(true);
      const request =
        direction === "undo"
          ? undoPdfDocument
          : direction === "redo"
            ? redoPdfDocument
            : restorePdfDocument;
      const { data } = await request(documentRef.current.id);
      updateDocument(data);
      hydrate(data);
      await loadLibrary(search);
    } catch (error) {
      toast.error(message(error));
    } finally {
      if (mounted.current) setBusy(false);
      endTransition();
    }
  };
  const download = async () => {
    if (
      !selectedDocument ||
      busy ||
      preparing ||
      editorLoading ||
      interacting ||
      !beginTransition()
    )
      return;
    try {
      if (regionsRef.current.length)
        throw new Error("Finish or clear the pending crop or redaction first.");
      if (!demo) await autosave.flush();
      window.location.assign(documentRef.current.download_url);
    } catch (error) {
      toast.error(message(error));
    } finally {
      endTransition();
    }
  };
  useEffect(() => {
    const handler = (event) => {
      const field = event.target?.closest?.(
        "input,textarea,select,[contenteditable='true']",
      );
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        selectedDocument &&
        !field
      ) {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (field || !editable || signatureOpen || confirmation || panel) return;
      if (interacting && event.key !== "Escape") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        history(event.shiftKey ? "redo" : "undo");
      } else if (
        ["Delete", "Backspace"].includes(event.key) &&
        selectedShapeId
      ) {
        event.preventDefault();
        deleteObject();
      } else if (event.key === "Escape") {
        setSelectedShapeId(null);
        setActiveTool("select");
        setFindOpen(false);
      } else if (
        selectedShape &&
        /^Arrow/.test(event.key) &&
        selectedShape.type !== "page_number"
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx =
            event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0,
          dy =
            event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0;
        const moved = movePdfShape(
          selectedShape,
          dx,
          dy,
          pageSize.width,
          pageSize.height,
        );
        setCanvasShapes((all) =>
          all.map((s) => (s.id === selectedShapeId ? moved : s)),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    const handler = (event) => {
      if (regionsRef.current.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    let replay = null;
    const leave = async (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (
        !anchor ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      if (anchor === replay) {
        replay = null;
        return;
      }
      const target = new URL(anchor.href, window.location.href);
      if (
        target.origin !== window.location.origin ||
        target.href === window.location.href ||
        (target.protocol !== "http:" && target.protocol !== "https:")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!beginTransition()) return;
      try {
        if (regionsRef.current.length)
          throw new Error(
            "Finish or clear the pending crop or redaction first.",
          );
        await saveRef.current?.flush();
        if (mounted.current) {
          replay = anchor;
          anchor.click();
        }
      } catch (error) {
        toast.error(message(error));
      } finally {
        endTransition();
      }
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [beginTransition, endTransition]);

  const setCanvasShapes = useCallback(
    (updater) => {
      const before = [...objectsRef.current, ...regionsRef.current],
        next = typeof updater === "function" ? updater(before) : updater;
      const owned = next
        .filter((shape) => !TRANSIENT_TYPES.includes(shape.type))
        .map((shape) =>
          IMAGE_TYPES.includes(shape.type) && !shape.asset_id && placementAsset
            ? { ...shape, ...placementAsset }
            : shape,
        );
      const pending = next.filter((shape) =>
        TRANSIENT_TYPES.includes(shape.type),
      );
      objectsRef.current = owned;
      regionsRef.current = pending;
      setObjects(owned);
      setRegions(pending);
    },
    [placementAsset],
  );
  const updateShape = (patch) => {
    if (!selectedShape || !editable) return;
    if (IMAGE_TYPES.includes(selectedShape.type)) {
      const ratio = selectedShape.width / selectedShape.height;
      if (patch.width !== undefined && patch.height === undefined)
        patch = { ...patch, height: patch.width / ratio };
      if (patch.height !== undefined && patch.width === undefined)
        patch = { ...patch, width: patch.height * ratio };
    }
    // Point-based shapes must move their actual points/endpoints, rather than unused boxes.
    if (
      selectedShape.type === "pen" &&
      (patch.x !== undefined || patch.y !== undefined)
    ) {
      const points = selectedShape.points || [];
      const minX = Math.min(...points.map((p) => p.x)),
        minY = Math.min(...points.map((p) => p.y));
      const dx = patch.x === undefined ? 0 : patch.x - minX,
        dy = patch.y === undefined ? 0 : patch.y - minY;
      patch = {
        points: points.map((p) => ({
          x: Math.max(0, Math.min(pageSize.width, p.x + dx)),
          y: Math.max(0, Math.min(pageSize.height, p.y + dy)),
        })),
      };
    }
    if (
      selectedShape.type === "arrow" &&
      (patch.x !== undefined || patch.y !== undefined)
    ) {
      if (patch.x !== undefined)
        patch.x2 = selectedShape.x2 + patch.x - selectedShape.x;
      if (patch.y !== undefined)
        patch.y2 = selectedShape.y2 + patch.y - selectedShape.y;
    }
    setCanvasShapes((all) =>
      all.map((shape) =>
        shape.id === selectedShapeId
          ? shape.type === "page_number" ||
            !["x", "y", "width", "height", "rotation", "points"].some(
              (key) => patch[key] !== undefined,
            )
            ? { ...shape, ...patch }
            : boundPdfShape(
                { ...shape, ...patch },
                pageSize.width,
                pageSize.height,
              )
          : shape,
      ),
    );
  };
  const applyPageScope = () => {
    try {
      const pages = parsePageRange(pageScopeDraft, count);
      if (!pages.length)
        throw new Error("Enter the pages to number, or choose All pages.");
      updateShape({ page_numbers: pages });
      setPageScopeError("");
    } catch (error) {
      setPageScopeError(message(error));
    }
  };
  const deleteObject = () => {
    setCanvasShapes((all) =>
      all.filter((shape) => shape.id !== selectedShapeId),
    );
    setSelectedShapeId(null);
  };
  const duplicateObject = () => {
    if (!selectedShape || TRANSIENT_TYPES.includes(selectedShape.type)) return;
    const copy = {
      ...(selectedShape.type === "page_number"
        ? selectedShape
        : movePdfShape(selectedShape, 12, 12, pageSize.width, pageSize.height)),
      id: crypto.randomUUID(),
    };
    setCanvasShapes((all) => [...all, copy]);
    setSelectedShapeId(copy.id);
  };
  const acceptImage = async (file, type = "image") => {
    if (!file || !editable) return;
    const acceptedDocumentId = documentRef.current?.id;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 10 * 1024 ** 2
    ) {
      toast.error("Choose a PNG or JPEG image up to 10MB.");
      return;
    }
    const preview = URL.createObjectURL(file);
    urls.current.add(preview);
    try {
      const image = new window.Image();
      image.src = preview;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      if (
        !mounted.current ||
        String(documentRef.current?.id) !== String(acceptedDocumentId) ||
        documentRef.current?.encrypted
      ) {
        urls.current.delete(preview);
        URL.revokeObjectURL(preview);
        return;
      }
      if (
        Math.min(image.naturalWidth, image.naturalHeight) < 8 ||
        Math.max(image.naturalWidth, image.naturalHeight) > 4000
      )
        throw new Error(
          "Images must be between 8 and 4000 pixels on each side.",
        );
      const id = crypto.randomUUID();
      setAssets((current) => ({ ...current, [id]: file }));
      setPlacementAsset({
        asset_id: id,
        preview_url: preview,
        aspect_ratio: image.naturalWidth / image.naturalHeight,
      });
      setActiveTool(type);
      setGroup("edit");
      setPanel(null);
      toast("Drag on the page to place your image.");
    } catch (e) {
      urls.current.delete(preview);
      URL.revokeObjectURL(preview);
      toast.error(message(e));
    }
  };
  const chooseTool = (tool) => {
    if (!editable) return;
    if (regions.length && tool !== activeTool) {
      toast.error("Finish or clear the pending crop or redaction first.");
      return;
    }
    if (tool === "signature") {
      setSignatureOpen(true);
      return;
    }
    if (IMAGE_TYPES.includes(tool)) {
      assetType.current = tool;
      assetInput.current?.click();
      return;
    }
    setActiveTool(tool);
    setPanel(null);
  };
  const applyRegions = async () => {
    if (!regions.length) return;
    if (regions[0].type === "crop") {
      await runOperation("crop", regions[0]);
      return;
    }
    if (
      regions.some(
        (r) => r.redaction_mode === "replace" && !r.replacement_text?.trim(),
      )
    ) {
      toast.error("Enter replacement text for each replacement area.");
      return;
    }
    setConfirmation({
      title: "Apply permanent redactions?",
      label: "Redact selected areas",
      danger: true,
      message:
        "Affected pages are flattened: selected content is removed, searchable text and interactive elements are lost, and added objects on those pages become final. Saved history still lets you undo this change.",
      action: () => runOperation("redact", { regions, confirmed: true }),
    });
  };
  const gestureEnd = (next) => {
    setInteracting(false);
    const pending = (
      next || [...objectsRef.current, ...regionsRef.current]
    ).filter((s) => TRANSIENT_TYPES.includes(s.type));
    if (pending[0]?.type === "crop") {
      cropRequest.current = pending[0];
    } else if (!pending.length) {
      invoke(() => autosave.saveNow())();
    }
  };
  useEffect(() => {
    if (interacting || !cropRequest.current) return;
    const crop = cropRequest.current;
    cropRequest.current = null;
    invoke(() => runOperation("crop", crop))();
  }, [interacting, regions]);
  const upload = async (files) => {
    if (demo || interacting || !beginTransition()) return;
    try {
      if (regionsRef.current.length)
        throw new Error("Finish or clear the pending crop or redaction first.");
      await autosave.flush();
      setUploading(true);
      let last;
      for (const file of files) {
        const { data } = await uploadPdfDocument(file, "", (event) =>
          setUploadProgress(
            event.total ? Math.round((event.loaded / event.total) * 100) : 0,
          ),
        );
        last = data;
      }
      await loadLibrary(search);
      if (last) await openDocument(last, { skipFlush: true });
      toast.success(
        `${files.length} PDF${files.length > 1 ? "s" : ""} uploaded.`,
      );
    } catch (e) {
      toast.error(message(e));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      endTransition();
    }
  };
  const deleteCurrentDocument = async () => {
    if (!beginTransition()) return;
    try {
      if (regionsRef.current.length)
        throw new Error("Finish or clear the pending crop or redaction first.");
      await autosave.flush();
      setBusy(true);
      await deletePdfDocument(documentRef.current.id);
      hydrate(null);
      const rows = await loadLibrary(search);
      if (rows[0]) await openDocument(rows[0], { skipFlush: true });
    } catch (error) {
      toast.error(message(error));
      throw error;
    } finally {
      if (mounted.current) setBusy(false);
      endTransition();
    }
  };
  const dropzone = useDropzone({
    onDrop: upload,
    onDropRejected: () => toast.error("Choose PDF files up to 50MB each."),
    accept: { "application/pdf": [".pdf"] },
    maxSize: 50 * 1024 ** 2,
    multiple: true,
    disabled:
      demo || uploading || busy || preparing || interacting || editorLoading,
  });
  let splitGroups = [],
    splitError = "";
  try {
    splitGroups = splitRows.map((range) => parsePageRange(range, count));
    if (splitGroups.some((pages) => !pages.length))
      splitError = "Enter pages for every part.";
    else if (new Set(splitGroups.flat()).size !== splitGroups.flat().length)
      splitError = "Page groups must not overlap.";
  } catch (e) {
    splitError = e.message;
  }

  const rename = async () => {
    if (!selectedDocument || title === selectedDocument.title) return;
    const documentId = selectedDocument.id;
    try {
      const { data } = await renamePdfDocument(documentId, title.trim());
      if (!mounted.current) return;
      setDocuments((rows) =>
        rows.map((row) =>
          String(row.id) === String(documentId)
            ? { ...row, title: data.title }
            : row,
        ),
      );
      if (String(documentRef.current?.id) === String(documentId)) {
        updateDocument({ ...documentRef.current, title: data.title });
        setTitle(data.title);
      }
    } catch (e) {
      toast.error(message(e));
      if (
        mounted.current &&
        String(documentRef.current?.id) === String(documentId)
      )
        setTitle(documentRef.current.title);
    }
  };
  const pagesPanel = () =>
    !selectedDocument ? (
      <p className="pdf-muted">Choose a document first.</p>
    ) : selectedDocument.encrypted ? (
      <p className="pdf-muted">
        Unlock this PDF to view and organize its pages.
      </p>
    ) : (
      <>
        <div className="pdf-page-selection">
          <div className="flex gap-2">
            <Button
              disabled={!editable}
              onClick={() =>
                setSelectedPages(
                  new Set(Array.from({ length: count }, (_, i) => i + 1)),
                )
              }
            >
              Select all
            </Button>
            <Button onClick={() => setSelectedPages(new Set())}>Clear</Button>
          </div>
          <Field label="Select page ranges">
            <input
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="1-3, 5"
            />
          </Field>
          <Button
            disabled={!editable || !rangeInput.trim()}
            onClick={() => {
              try {
                setSelectedPages(new Set(parsePageRange(rangeInput, count)));
              } catch (e) {
                toast.error(message(e));
              }
            }}
          >
            Select range
          </Button>
          <p className="pdf-muted">
            {selectedPages.size} of {count} selected
          </p>
        </div>
        <PageOrganizer
          documentRecord={selectedDocument}
          currentPage={currentPage}
          selected={selectedPages}
          onSelect={(page) =>
            setSelectedPages((current) => {
              const next = new Set(current);
              next.has(page) ? next.delete(page) : next.add(page);
              return next;
            })
          }
          onNavigate={(page) => {
            setCurrentPage(page);
            setPanel(null);
          }}
          onReorder={(order) =>
            invoke(() => runOperation("reorder_pages", { page_order: order }))()
          }
          disabled={!editable}
        />
      </>
    );
  const libraryPanel = () => (
    <>
      <div className="pdf-library-controls">
        {!demo && (
          <>
            <div
              {...dropzone.getRootProps()}
              className={`pdf-upload ${dropzone.isDragActive ? "is-active" : ""}`}
            >
              <input {...dropzone.getInputProps()} />
              {uploading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Upload size={20} />
              )}
              <strong>
                {uploading ? `Uploading ${uploadProgress}%` : "Upload PDFs"}
              </strong>
              <span>Up to 50MB each</span>
            </div>
            <Field label="Search documents">
              <div className="pdf-input-icon">
                {searching ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                <input
                  aria-label="Search documents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or document text"
                />
              </div>
            </Field>
            <p className="pdf-muted">
              {usage.document_count || 0}
              {usage.document_limit ? ` / ${usage.document_limit}` : ""}{" "}
              documents · {bytes(usage.storage_bytes)}
              {usage.storage_limit_bytes
                ? ` / ${bytes(usage.storage_limit_bytes)}`
                : ""}
            </p>
          </>
        )}
      </div>
      <div className="pdf-library-list">
        {documents.map((doc) => (
          <button
            type="button"
            key={doc.id}
            disabled={busy || preparing || editorLoading || interacting}
            className={`pdf-document-row ${String(selectedDocument?.id) === String(doc.id) ? "is-current" : ""}`}
            onClick={invoke(() => openDocument(doc))}
            aria-current={
              String(selectedDocument?.id) === String(doc.id)
                ? "true"
                : undefined
            }
          >
            <span className="pdf-document-thumb">
              {doc.thumbnail_url ? (
                <img src={doc.thumbnail_url} alt="" />
              ) : doc.encrypted ? (
                <Lock size={20} />
              ) : (
                <FileText size={20} />
              )}
            </span>
            <span>
              <strong>{doc.title}</strong>
              <small>
                {doc.encrypted ? "Locked" : `${doc.page_count || 0} pages`} ·{" "}
                {bytes(doc.byte_size)}
              </small>
            </span>
          </button>
        ))}
        {!documents.length && search && (
          <p className="pdf-muted p-4">No documents match “{search}”.</p>
        )}
      </div>
    </>
  );
  const propertiesPanel = () =>
    selectedShape && (
      <Section title={`${labelFor(selectedShape)} properties`}>
        <fieldset className="pdf-properties" disabled={!editable}>
          {["text", "watermark"].includes(selectedShape.type) && (
            <Field label="Text">
              <textarea
                rows={3}
                value={selectedShape.text || ""}
                onChange={(e) => updateShape({ text: e.target.value })}
                maxLength={5000}
              />
            </Field>
          )}
          {selectedShape.type === "page_number" ? (
            <>
              <Field label="Page scope">
                <select
                  value={selectedShape.page_numbers?.length ? "custom" : "all"}
                  onChange={(event) =>
                    updateShape({
                      page_numbers:
                        event.target.value === "all"
                          ? []
                          : selectedNumbers.length
                            ? selectedNumbers
                            : [currentPage],
                    })
                  }
                >
                  <option value="all">All pages</option>
                  <option value="custom">Choose pages</option>
                </select>
              </Field>
              {selectedShape.page_numbers?.length > 0 && (
                <>
                  <Field label="Pages to number">
                    <input
                      value={pageScopeDraft}
                      placeholder="1-3, 5"
                      aria-invalid={Boolean(pageScopeError)}
                      onChange={(event) =>
                        setPageScopeDraft(event.target.value)
                      }
                      onBlur={applyPageScope}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyPageScope();
                        }
                      }}
                    />
                  </Field>
                  {pageScopeError && (
                    <p className="pdf-field-error" role="alert">
                      {pageScopeError}
                    </p>
                  )}
                </>
              )}
              <Field label="Position">
                <select
                  value={selectedShape.position || "bottom-center"}
                  onChange={(e) => updateShape({ position: e.target.value })}
                >
                  {[
                    "top-left",
                    "top-center",
                    "top-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right",
                  ].map((pos) => (
                    <option key={pos} value={pos}>
                      {pos.replace("-", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Number format">
                <select
                  value={selectedShape.format || "page_of_total"}
                  onChange={(e) => updateShape({ format: e.target.value })}
                >
                  <option value="number">1</option>
                  <option value="page_number">Page 1</option>
                  <option value="page_of_total">Page 1 of 10</option>
                </select>
              </Field>
              <Field label="Starting number">
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={selectedShape.start_number || 1}
                  onChange={(e) =>
                    updateShape({
                      start_number: Math.max(
                        1,
                        Math.min(9999, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </Field>
              <p className="pdf-muted">
                Numbering follows document page order.
              </p>
              <Field label="Margin (points)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedShape.margin ?? 24}
                  onChange={(event) =>
                    updateShape({
                      margin: Math.max(
                        0,
                        Math.min(100, Number(event.target.value)),
                      ),
                    })
                  }
                />
              </Field>
            </>
          ) : (
            !["pen", "arrow"].includes(selectedShape.type) && (
              <div className="pdf-properties-grid">
                {["x", "y", "width", "height"]
                  .filter((key) => selectedShape[key] !== undefined)
                  .map((key) => (
                    <Field label={key.toUpperCase()} key={key}>
                      <input
                        type="number"
                        min="0"
                        max={
                          key === "x" || key === "width"
                            ? pageSize.width
                            : pageSize.height
                        }
                        value={Math.round(selectedShape[key])}
                        onChange={(e) => {
                          const value = Math.max(
                            0,
                            Math.min(
                              Number(e.target.value),
                              key === "x" || key === "width"
                                ? pageSize.width
                                : pageSize.height,
                            ),
                          );
                          updateShape({ [key]: value });
                        }}
                      />
                    </Field>
                  ))}
              </div>
            )
          )}
          {[
            "text",
            "watermark",
            "image",
            "signature",
            "stamp",
            "highlight",
            "rectangle",
            "strike",
          ].includes(selectedShape.type) && (
            <Field label="Rotation (degrees)">
              <input
                type="number"
                min="-360"
                max="360"
                step="1"
                value={Math.round(selectedShape.rotation || 0)}
                onChange={(event) =>
                  updateShape({
                    rotation: Math.max(
                      -360,
                      Math.min(360, Number(event.target.value)),
                    ),
                  })
                }
              />
            </Field>
          )}
          {["text", "watermark", "page_number"].includes(
            selectedShape.type,
          ) && (
            <Field label="Font size">
              <input
                type="number"
                min="8"
                max="96"
                value={selectedShape.font_size || 16}
                onChange={(e) =>
                  updateShape({
                    font_size: Math.max(
                      8,
                      Math.min(96, Number(e.target.value)),
                    ),
                  })
                }
              />
            </Field>
          )}
          {IMAGE_TYPES.includes(selectedShape.type) && (
            <Field
              label={`Opacity (${Math.round((selectedShape.opacity ?? 1) * 100)}%)`}
            >
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={selectedShape.opacity ?? 1}
                onChange={(event) =>
                  updateShape({ opacity: Number(event.target.value) })
                }
              />
            </Field>
          )}
          {selectedShape.type === "redact" ? (
            <>
              <Field label="Redaction style">
                <select
                  value={selectedShape.redaction_mode || "black"}
                  onChange={(e) =>
                    updateShape({ redaction_mode: e.target.value })
                  }
                >
                  <option value="black">Black</option>
                  <option value="blank">Blank</option>
                  <option value="replace">Replace</option>
                </select>
              </Field>
              {selectedShape.redaction_mode === "replace" && (
                <>
                  <Field label="Replacement text">
                    <textarea
                      value={selectedShape.replacement_text || ""}
                      maxLength={500}
                      onChange={(e) =>
                        updateShape({ replacement_text: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Replacement font size">
                    <input
                      type="number"
                      min="6"
                      max="72"
                      value={selectedShape.font_size || 14}
                      onChange={(e) =>
                        updateShape({
                          font_size: Math.max(
                            6,
                            Math.min(72, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            !IMAGE_TYPES.includes(selectedShape.type) && (
              <>
                <Field label="Color">
                  <input
                    type="color"
                    value={selectedShape.color || "#111827"}
                    onChange={(e) => updateShape({ color: e.target.value })}
                  />
                </Field>
                {["rectangle", "highlight"].includes(selectedShape.type) && (
                  <Field label="Fill color">
                    <input
                      type="color"
                      value={
                        selectedShape.fill_color ||
                        (selectedShape.type === "highlight"
                          ? "#fde047"
                          : "#ffffff")
                      }
                      onChange={(e) =>
                        updateShape({ fill_color: e.target.value })
                      }
                    />
                  </Field>
                )}
                {["rectangle", "pen", "arrow", "strike"].includes(
                  selectedShape.type,
                ) && (
                  <Field label="Line width">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={selectedShape.stroke_width || 3}
                      onChange={(e) =>
                        updateShape({
                          stroke_width: Math.max(
                            1,
                            Math.min(12, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                  </Field>
                )}
                <Field
                  label={`Opacity (${Math.round((selectedShape.opacity ?? 1) * 100)}%)`}
                >
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={selectedShape.opacity ?? 1}
                    onChange={(e) =>
                      updateShape({ opacity: Number(e.target.value) })
                    }
                  />
                </Field>
              </>
            )
          )}
          <div className="flex gap-2">
            <Button
              icon={Copy}
              disabled={
                !editable || TRANSIENT_TYPES.includes(selectedShape.type)
              }
              onClick={duplicateObject}
            >
              Duplicate
            </Button>
            <Button
              danger
              icon={Trash2}
              disabled={!editable}
              onClick={deleteObject}
            >
              Delete
            </Button>
          </div>
        </fieldset>
      </Section>
    );
  const toolsPanel = () => (
    <>
      {!selectedDocument ? (
        <p className="pdf-muted">Choose a document first.</p>
      ) : demo ? (
        <p className="pdf-muted">Editing tools are disabled in the demo.</p>
      ) : selectedDocument.encrypted ? (
        <Section title="Password-protected PDF">
          <p className="pdf-muted">
            Enter its password to restore editable access.
          </p>
          <Field label="PDF password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button
            primary
            icon={Unlock}
            disabled={busy || preparing || !password}
            onClick={invoke(async () => {
              await runOperation("unlock", {}, { password });
              setPassword("");
            })}
          >
            Unlock PDF
          </Button>
        </Section>
      ) : (
        <>
          {propertiesPanel()}
          {regions.length > 0 && (
            <Section title="Pending areas">
              <p className="pdf-muted">
                {regions.length} {regions[0].type} area
                {regions.length > 1 ? "s" : ""}. Redactions need confirmation.
              </p>
              <div className="flex gap-2">
                <Button
                  primary
                  disabled={!editable}
                  onClick={invoke(applyRegions)}
                >
                  {regions[0].type === "redact"
                    ? "Review redactions"
                    : "Apply crop"}
                </Button>
                <Button
                  onClick={() => {
                    setRegions([]);
                    regionsRef.current = [];
                    setSelectedShapeId(null);
                    setActiveTool("select");
                  }}
                >
                  Clear
                </Button>
              </div>
            </Section>
          )}
          {group === "edit" && (
            <Section title="Add to your document">
              <p className="pdf-muted">
                Choose Text, Image, Signature or Stamp above, then place it on
                the page. Your additions remain editable.
              </p>
              <Button
                icon={PenLine}
                disabled={!editable}
                onClick={() => setSignatureOpen(true)}
              >
                Draw a signature
              </Button>
              <Button
                icon={Image}
                disabled={!editable}
                onClick={() => {
                  assetType.current = "signature";
                  assetInput.current?.click();
                }}
              >
                Upload a signature
              </Button>
            </Section>
          )}
          {group === "annotate" && (
            <Section title="Mark up the page">
              <p className="pdf-muted">
                Highlight, draw, or add shapes and watermarks. Drag an object to
                move it; use its handles to resize.
              </p>
            </Section>
          )}
          {group === "pages" && (
            <>
              <Section title="Page actions">
                <p className="pdf-muted">
                  {selectedNumbers.length
                    ? `Selected: ${selectedNumbers.join(", ")}`
                    : "Select pages using the Pages panel."}
                </p>
                <div className="pdf-actions-grid">
                  <Button
                    icon={RotateCcw}
                    disabled={!editable || !selectedNumbers.length}
                    onClick={invoke(() =>
                      runOperation("rotate_pages", {
                        page_numbers: selectedNumbers,
                        degrees: 270,
                      }),
                    )}
                  >
                    Rotate left
                  </Button>
                  <Button
                    icon={RotateCw}
                    disabled={!editable || !selectedNumbers.length}
                    onClick={invoke(() =>
                      runOperation("rotate_pages", {
                        page_numbers: selectedNumbers,
                        degrees: 90,
                      }),
                    )}
                  >
                    Rotate right
                  </Button>
                  <Button
                    icon={Copy}
                    disabled={!editable || !selectedNumbers.length}
                    onClick={invoke(() =>
                      runOperation("duplicate_pages", {
                        page_numbers: selectedNumbers,
                      }),
                    )}
                  >
                    Duplicate
                  </Button>
                  <Button
                    icon={Scissors}
                    disabled={!editable || !selectedNumbers.length}
                    onClick={invoke(() =>
                      runOperation("extract_pages", {
                        page_numbers: selectedNumbers,
                      }),
                    )}
                  >
                    Extract
                  </Button>
                  <Button
                    icon={FilePlus2}
                    disabled={!editable}
                    onClick={invoke(() =>
                      runOperation("add_blank_page", {
                        position: currentPage + 1,
                        reference_page_number: currentPage,
                      }),
                    )}
                  >
                    Blank page
                  </Button>
                  <Button
                    danger
                    icon={Trash2}
                    disabled={
                      !editable ||
                      !selectedNumbers.length ||
                      selectedNumbers.length >= count
                    }
                    onClick={() =>
                      setConfirmation({
                        title: "Delete selected pages?",
                        message: `${selectedNumbers.length} pages and their added objects will be removed. You can undo this change.`,
                        label: "Delete pages",
                        danger: true,
                        action: () =>
                          runOperation("delete_pages", {
                            page_numbers: selectedNumbers,
                          }),
                      })
                    }
                  >
                    Delete pages
                  </Button>
                </div>
                <Button
                  icon={Hash}
                  disabled={!editable}
                  onClick={() => {
                    const existing = objects.find(
                      (s) => s.type === "page_number",
                    );
                    if (existing) {
                      setSelectedShapeId(existing.id);
                      return;
                    }
                    const number = {
                      id: crypto.randomUUID(),
                      type: "page_number",
                      position: "bottom-center",
                      start_number: 1,
                      format: "page_of_total",
                      margin: 24,
                      font_size: 12,
                      color: "#111827",
                      page_numbers: selectedNumbers,
                    };
                    setObjects((current) => [...current, number]);
                    setSelectedShapeId(number.id);
                  }}
                >
                  Page numbers
                </Button>
              </Section>
              <Disclosure title="Merge PDFs">
                <p className="pdf-muted">
                  Choose at least two unlocked PDFs. Use the arrows to set their
                  order.
                </p>
                <div className="pdf-merge-list">
                  {documents.map((doc) => (
                    <label key={doc.id}>
                      <input
                        type="checkbox"
                        disabled={!editable || doc.encrypted}
                        checked={mergeIds.includes(doc.id)}
                        onChange={(e) =>
                          setMergeIds((ids) =>
                            e.target.checked
                              ? [...ids, doc.id]
                              : ids.filter((id) => id !== doc.id),
                          )
                        }
                      />
                      <span>{doc.title}</span>
                    </label>
                  ))}
                </div>
                {mergeIds.map((id, index) => (
                  <div key={id} className="pdf-merge-order">
                    <span>
                      {index + 1}.{" "}
                      {documents.find((doc) => doc.id === id)?.title ||
                        `Document ${id}`}
                    </span>
                    <Button
                      aria-label={`Move merged document ${index + 1} up`}
                      disabled={index === 0 || !editable}
                      onClick={() =>
                        setMergeIds((ids) => {
                          const next = [...ids];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                      icon={ChevronLeft}
                    />
                    <Button
                      aria-label={`Move merged document ${index + 1} down`}
                      disabled={index === mergeIds.length - 1 || !editable}
                      onClick={() =>
                        setMergeIds((ids) => {
                          const next = [...ids];
                          [next[index], next[index + 1]] = [
                            next[index + 1],
                            next[index],
                          ];
                          return next;
                        })
                      }
                      icon={ChevronRight}
                    />
                  </div>
                ))}
                <Field label="Merged document title">
                  <input
                    maxLength={160}
                    value={mergeTitle}
                    onChange={(e) => setMergeTitle(e.target.value)}
                  />
                </Field>
                <Button
                  primary
                  icon={Merge}
                  disabled={
                    !editable || mergeIds.length < 2 || !mergeTitle.trim()
                  }
                  onClick={invoke(async () => {
                    await runOperation(
                      "merge",
                      { document_ids: mergeIds, title: mergeTitle.trim() },
                      { documentId: null },
                    );
                    setMergeIds([]);
                  })}
                >
                  Merge in this order
                </Button>
              </Disclosure>
              <Disclosure title="Split PDF">
                <Field label="Split method">
                  <select
                    value={splitMode}
                    onChange={(e) => setSplitMode(e.target.value)}
                  >
                    <option value="ranges">Page groups</option>
                    <option value="size">Maximum file size</option>
                  </select>
                </Field>
                {splitMode === "ranges" ? (
                  <>
                    {splitRows.map((range, index) => (
                      <div key={index} className="pdf-split-row">
                        <Field label={`Part ${index + 1} pages`}>
                          <input
                            value={range}
                            placeholder="1-3, 5"
                            onChange={(e) =>
                              setSplitRows((rows) =>
                                rows.map((row, i) =>
                                  i === index ? e.target.value : row,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Button
                          aria-label={`Remove part ${index + 1}`}
                          icon={X}
                          disabled={splitRows.length <= 2}
                          onClick={() =>
                            setSplitRows((rows) =>
                              rows.filter((_, i) => i !== index),
                            )
                          }
                        />
                      </div>
                    ))}
                    <Button
                      icon={Plus}
                      disabled={splitRows.length >= 25}
                      onClick={() => setSplitRows((rows) => [...rows, ""])}
                    >
                      Add part
                    </Button>
                    {splitError ? (
                      <p className="pdf-muted">{splitError}</p>
                    ) : (
                      <>
                        <p className="pdf-muted">
                          Creates {splitGroups.length} PDFs:{" "}
                          {splitGroups
                            .map((pages) => `${pages.length} pages`)
                            .join(" · ")}
                          . The original is kept.
                        </p>
                        <ul
                          className="pdf-split-preview"
                          aria-label="Split file preview"
                        >
                          {splitGroups.map((pages, index) => (
                            <li key={index}>
                              <strong>
                                {selectedDocument.original_filename.replace(
                                  /\.pdf$/i,
                                  "",
                                )}
                                -part-{index + 1}.pdf
                              </strong>
                              <span>Pages {pages.join(", ")}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <Button
                      primary
                      disabled={!editable || Boolean(splitError)}
                      onClick={invoke(() =>
                        runOperation("split_by_ranges", {
                          page_groups: splitGroups,
                        }),
                      )}
                    >
                      Create split documents
                    </Button>
                  </>
                ) : (
                  <>
                    <Field label="Maximum file size (MB)">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={splitSize}
                        onChange={(e) => setSplitSize(Number(e.target.value))}
                      />
                    </Field>
                    <p className="pdf-muted">
                      Each part keeps whole pages. A page larger than the limit
                      cannot be split further.
                    </p>
                    <Button
                      primary
                      disabled={!editable || splitSize < 1 || splitSize > 50}
                      onClick={invoke(() =>
                        runOperation("split_by_size", {
                          max_size_mb: splitSize,
                        }),
                      )}
                    >
                      Split by size
                    </Button>
                  </>
                )}
              </Disclosure>
            </>
          )}
          {group === "secure" && (
            <>
              <Section title="Redaction">
                <p className="pdf-muted">
                  Draw areas with the Redact tool. Choose black, blank or
                  replacement text, then review before removing content.
                </p>
              </Section>
              <Section title="Password protection">
                <Field label="New PDF password">
                  <input
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button
                  primary
                  icon={Lock}
                  disabled={!editable || password.length < 8}
                  onClick={invoke(async () => {
                    await runOperation("protect", {}, { password });
                    setPassword("");
                  })}
                >
                  Protect PDF
                </Button>
              </Section>
            </>
          )}
          {group === "export" && (
            <>
              <Section title="Export and optimize">
                <Button
                  icon={Download}
                  primary
                  disabled={busy || preparing || editorLoading || interacting}
                  onClick={invoke(download)}
                >
                  Download PDF
                </Button>
                <Button
                  icon={FileArchive}
                  disabled={!editable}
                  onClick={invoke(() => runOperation("compress"))}
                >
                  Compress PDF
                </Button>
                <Button
                  icon={FileText}
                  disabled={!editable}
                  onClick={invoke(() => runOperation("extract_text"))}
                >
                  Extract text
                </Button>
                <Button
                  icon={Images}
                  disabled={!editable}
                  onClick={invoke(() => runOperation("export_images"))}
                >
                  Export page images
                </Button>
              </Section>
              <Disclosure title="Document settings">
                <Field label="Document title">
                  <input
                    value={title}
                    maxLength={160}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={rename}
                  />
                </Field>
                <Button
                  icon={RotateCcw}
                  disabled={!editable}
                  onClick={() =>
                    setConfirmation({
                      title: "Restore original PDF?",
                      message:
                        "Return to the original upload. Saved history remains available for redo.",
                      label: "Restore original",
                      action: () => history("original"),
                    })
                  }
                >
                  Restore original
                </Button>
                <Button
                  danger
                  icon={Trash2}
                  disabled={!editable}
                  onClick={() =>
                    setConfirmation({
                      title: "Delete document permanently?",
                      message: `“${selectedDocument.title}” and all saved versions and assets will be deleted.`,
                      label: "Delete document",
                      danger: true,
                      action: deleteCurrentDocument,
                    })
                  }
                >
                  Delete document
                </Button>
              </Disclosure>
            </>
          )}
          {objects.length > 0 && (
            <Disclosure title={`Added objects (${objects.length})`}>
              <div className="pdf-object-list">
                {objects.map((shape) => (
                  <button
                    type="button"
                    key={shape.id}
                    aria-pressed={shape.id === selectedShapeId}
                    onClick={() => {
                      setSelectedShapeId(shape.id);
                      if (shape.page_number) setCurrentPage(shape.page_number);
                    }}
                  >
                    {labelFor(shape)}
                    {shape.page_number
                      ? ` · Page ${shape.page_number}`
                      : " · All selected pages"}
                  </button>
                ))}
              </div>
            </Disclosure>
          )}
        </>
      )}
      {((operation && operation.kind !== "save_objects") ||
        visibleOperations.length > 0 ||
        artifacts.length > 0) && (
        <Section title="Activity and generated files">
          {operation && (
            <div role="status" className="pdf-operation">
              <span>
                {operation.kind?.replaceAll("_", " ")} · {operation.status}
              </span>
              {busy && <progress max="100" value={operation.progress || 10} />}
              {operation.error && <p>{operation.error}</p>}
              {["queued", "processing"].includes(operation.status) && !busy && (
                <Button
                  disabled={preparing}
                  onClick={invoke(async () => {
                    if (!beginTransition()) return;
                    setBusy(true);
                    try {
                      await finishOperation(await poll(operation.id));
                    } catch (e) {
                      toast.error(message(e));
                    } finally {
                      setBusy(false);
                      endTransition();
                    }
                  })}
                >
                  Check status
                </Button>
              )}
              {operation.result?.original_bytes != null && (
                <p>
                  {bytes(operation.result.original_bytes)} →{" "}
                  {bytes(
                    operation.result.compressed_bytes ||
                      operation.result.original_bytes,
                  )}
                </p>
              )}
            </div>
          )}
          {artifacts.map((artifact) => (
            <a
              className="pdf-artifact"
              key={artifact.id}
              href={artifact.download_url}
            >
              <Download size={15} />
              <span>
                {artifact.filename}
                <small>
                  {artifact.expires_at
                    ? `Available until ${new Date(artifact.expires_at).toLocaleString()}`
                    : "Download generated file"}
                </small>
              </span>
            </a>
          ))}
          {visibleOperations
            .filter((item) => item.id !== operation?.id)
            .slice(0, 4)
            .map((item) => (
              <div className="pdf-muted" key={item.id}>
                {item.kind?.replaceAll("_", " ")} · {item.status}
                {["queued", "processing"].includes(item.status) && (
                  <Button
                    onClick={() => {
                      setOperation(item);
                      operationRef.current = item;
                    }}
                  >
                    View status
                  </Button>
                )}
              </div>
            ))}
        </Section>
      )}
    </>
  );
  if (loading)
    return (
      <div
        className="nexus-pdf-master pdf-loading"
        aria-busy="true"
        aria-label="Loading document library"
      >
        <Loader2 className="animate-spin" />
        <span>Loading documents…</span>
      </div>
    );
  return (
    <div className="nexus-pdf-master pdf-workspace">
      <input
        ref={assetInput}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Upload object image"
        onChange={(e) => {
          acceptImage(e.target.files?.[0], assetType.current);
          e.target.value = "";
        }}
      />
      <header className="pdf-workspace-header">
        <div className="pdf-workspace-brand">
          <span className="pdf-brand-icon">
            <FileText size={21} />
          </span>
          <div>
            <span className="pdf-eyebrow">PDF MASTER</span>
            <h1>{selectedDocument?.title || "Your document library"}</h1>
          </div>
        </div>
        <div className="pdf-header-actions">
          {selectedDocument && (
            <>
              {!demo && (
                <>
                  <span
                    className={`pdf-save-status is-${autosave.status}`}
                    role="status"
                  >
                    {autosave.status === "saving" ||
                    autosave.status === "unsaved" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : autosave.status === "error" ? (
                      <Shield size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                    {autosave.status === "error"
                      ? "Save failed"
                      : autosave.status === "saving" ||
                          autosave.status === "unsaved"
                        ? "Saving…"
                        : "Saved"}
                  </span>
                  <Button
                    icon={Undo2}
                    aria-label="Undo last PDF change"
                    title="Undo (Ctrl+Z)"
                    disabled={
                      busy ||
                      preparing ||
                      editorLoading ||
                      !selectedDocument.can_undo
                    }
                    onClick={invoke(() => history("undo"))}
                  />
                  <Button
                    icon={Redo2}
                    aria-label="Redo PDF change"
                    title="Redo (Ctrl+Shift+Z)"
                    disabled={
                      busy ||
                      preparing ||
                      editorLoading ||
                      !selectedDocument.can_redo
                    }
                    onClick={invoke(() => history("redo"))}
                  />
                </>
              )}
              <Button
                icon={Search}
                aria-label="Find in document"
                disabled={selectedDocument.encrypted}
                onClick={() => setFindOpen((open) => !open)}
              />
              <Button
                icon={Download}
                primary
                disabled={busy || preparing || editorLoading || interacting}
                onClick={invoke(download)}
              >
                <span className="hidden sm:inline">Download</span>
              </Button>
            </>
          )}
        </div>
      </header>
      {demo && (
        <div className="pdf-demo-note">
          Read-only sample. Sign in with a regular account to save and edit
          documents.
        </div>
      )}
      {autosave.status === "error" && (
        <div className="pdf-save-error" role="alert">
          <span>
            {message(autosave.error) ||
              "Your changes are still here. Retry to save them."}
          </span>
          <Button onClick={invoke(() => autosave.retry())}>Retry save</Button>
          <Button
            onClick={() =>
              setConfirmation({
                title: "Reload the saved version?",
                message:
                  "Your unsaved changes will be discarded. The latest saved document will be loaded.",
                label: "Reload saved version",
                action: () =>
                  openDocument(documentRef.current.id, { skipFlush: true }),
              })
            }
          >
            Reload saved version
          </Button>
        </div>
      )}
      {libraryError && !documents.length ? (
        <div className="pdf-empty" role="alert">
          <Shield size={36} />
          <h2>Documents are unavailable</h2>
          <p>{libraryError}</p>
          <Button
            primary
            onClick={invoke(async () => {
              setLoading(true);
              try {
                const rows = await loadLibrary(search);
                if (rows[0]) await openDocument(rows[0], { skipFlush: true });
              } catch (e) {
                setLibraryError(message(e));
              } finally {
                setLoading(false);
              }
            })}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="pdf-workspace-body">
            <aside className="pdf-left-panel hidden lg:flex">
              <nav aria-label="Document navigation">
                <Button
                  className={leftTab === "library" ? "is-active" : ""}
                  icon={Library}
                  onClick={() => setLeftTab("library")}
                >
                  Library
                </Button>
                <Button
                  className={leftTab === "pages" ? "is-active" : ""}
                  icon={Images}
                  onClick={() => setLeftTab("pages")}
                >
                  Pages
                </Button>
              </nav>
              <div className="pdf-panel-scroll">
                {leftTab === "library" ? libraryPanel() : pagesPanel()}
              </div>
            </aside>
            <main className="pdf-editor-main">
              {selectedDocument ? (
                <>
                  <nav className="pdf-group-tabs" aria-label="PDF tool groups">
                    {GROUPS.map(([id, label, Icon]) => (
                      <button
                        type="button"
                        key={id}
                        aria-pressed={group === id}
                        className={group === id ? "is-active" : ""}
                        onClick={() => {
                          setGroup(id);
                          if (!regions.length) setActiveTool("select");
                          if (id === "pages") setLeftTab("pages");
                        }}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </nav>
                  <div className="pdf-tool-strip">
                    <div>
                      <Button
                        icon={MousePointer2}
                        className={activeTool === "select" ? "is-active" : ""}
                        aria-label="Select tool"
                        aria-pressed={activeTool === "select"}
                        onClick={() => setActiveTool("select")}
                        disabled={!editable}
                      >
                        Select
                      </Button>
                      {TOOLS[group].map(([tool, label, Icon]) => (
                        <Button
                          key={tool}
                          icon={Icon}
                          aria-label={`${label} tool`}
                          aria-pressed={activeTool === tool}
                          className={activeTool === tool ? "is-active" : ""}
                          disabled={!editable}
                          onClick={() => chooseTool(tool)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <Button
                      className="xl:hidden"
                      icon={ChevronDown}
                      onClick={() => setPanel("tools")}
                    >
                      Options
                    </Button>
                  </div>
                  {findOpen && (
                    <PdfFindBar
                      query={findQuery}
                      onQueryChange={setFindQuery}
                      matches={findMatches}
                      activeIndex={findIndex}
                      onNavigate={navigateFind}
                      onClose={() => setFindOpen(false)}
                      searching={findSearching}
                      error={findError}
                    />
                  )}
                  {editorLoading ? (
                    <div className="pdf-empty">
                      <Loader2 className="animate-spin" />
                      Opening document…
                    </div>
                  ) : selectedDocument.encrypted ? (
                    <div className="pdf-empty">
                      <Lock size={38} />
                      <h2>Password-protected PDF</h2>
                      <p>Enter the password to restore editable access.</p>
                      <Field label="Unlock password">
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </Field>
                      <Button
                        primary
                        disabled={busy || preparing || !password || demo}
                        onClick={invoke(async () => {
                          await runOperation("unlock", {}, { password });
                          setPassword("");
                        })}
                      >
                        Unlock
                      </Button>
                    </div>
                  ) : (
                    <PdfDocumentCanvas
                      documentRecord={{
                        ...selectedDocument,
                        content_url:
                          selectedDocument.editor_state?.background_url ||
                          selectedDocument.content_url,
                        current_version_id:
                          selectedDocument.editor_state?.layer_id ||
                          selectedDocument.current_version_id,
                      }}
                      pageNumber={currentPage}
                      zoom={zoom}
                      zoomMode={zoomMode}
                      activeTool={demo ? null : activeTool}
                      editable={editable}
                      shapes={shapes}
                      setShapes={setCanvasShapes}
                      selectedShapeId={selectedShapeId}
                      setSelectedShapeId={setSelectedShapeId}
                      onGestureStart={() => setInteracting(true)}
                      onGestureCancel={() => setInteracting(false)}
                      onGestureEnd={gestureEnd}
                      onDocumentLoaded={(numPages, proxy) => {
                        setPdfProxy(proxy);
                        if (!selectedDocument.page_count)
                          updateDocument({
                            ...selectedDocument,
                            page_count: numPages,
                          });
                      }}
                      onPageLoaded={setPageSize}
                      findOpen={findOpen}
                      findMatches={findMatches.filter(
                        (match) => match.pageNumber === currentPage,
                      )}
                      findMatch={findMatches[findIndex]}
                    />
                  )}
                  <footer className="pdf-view-controls">
                    <div>
                      <Button
                        icon={ChevronLeft}
                        aria-label="Previous page"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      />
                      <label className="pdf-page-jump">
                        Page
                        <input
                          type="number"
                          aria-label="Current page"
                          min="1"
                          max={count || 1}
                          value={currentPage}
                          onChange={(e) =>
                            setCurrentPage(
                              Math.max(
                                1,
                                Math.min(
                                  count || 1,
                                  Math.trunc(Number(e.target.value)) || 1,
                                ),
                              ),
                            )
                          }
                        />
                        <span>of {count}</span>
                      </label>
                      <Button
                        icon={ChevronRight}
                        aria-label="Next page"
                        disabled={currentPage >= count}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      />
                    </div>
                    <div>
                      <Button
                        icon={ZoomOut}
                        aria-label="Zoom out"
                        onClick={() => {
                          setZoomMode("custom");
                          setZoom((z) => Math.max(0.25, z - 0.1));
                        }}
                      />
                      <select
                        aria-label="PDF zoom"
                        value={zoomMode === "custom" ? "custom" : zoomMode}
                        onChange={(e) => {
                          setZoomMode(e.target.value);
                          if (e.target.value === "custom") setZoom(1);
                        }}
                      >
                        <option value="fit-width">Fit width</option>
                        <option value="fit-page">Fit page</option>
                        <option value="custom">
                          {Math.round(zoom * 100)}%
                        </option>
                      </select>
                      <Button
                        icon={ZoomIn}
                        aria-label="Zoom in"
                        onClick={() => {
                          setZoomMode("custom");
                          setZoom((z) => Math.min(4, z + 0.1));
                        }}
                      />
                    </div>
                  </footer>
                </>
              ) : (
                <div className="pdf-empty">
                  <FilePlus2 size={46} />
                  <h2>Add your first PDF</h2>
                  <p>
                    Documents stay in your personal library until you delete
                    them.
                  </p>
                  {!demo && (
                    <Button primary icon={Upload} onClick={dropzone.open}>
                      Choose PDF
                    </Button>
                  )}
                </div>
              )}
            </main>
            <aside className="pdf-right-panel hidden xl:flex">
              <header>
                <h2>
                  {selectedShape
                    ? "Object settings"
                    : `${GROUPS.find(([id]) => id === group)?.[1]} tools`}
                </h2>
                <span>Everything you need for this task</span>
              </header>
              <div className="pdf-panel-scroll">
                {panel !== "tools" && toolsPanel()}
              </div>
            </aside>
          </div>
          <nav
            className="pdf-mobile-nav xl:hidden"
            aria-label="Document panels"
          >
            <Button icon={Library} onClick={() => setPanel("library")}>
              Library
            </Button>
            <Button icon={Images} onClick={() => setPanel("pages")}>
              Pages
            </Button>
            <Button icon={ChevronDown} onClick={() => setPanel("tools")}>
              Tools
            </Button>
          </nav>
        </>
      )}
      <Modal
        open={Boolean(panel)}
        title={panel ? panel[0].toUpperCase() + panel.slice(1) : "Tools"}
        onClose={() => setPanel(null)}
      >
        {panel === "library"
          ? libraryPanel()
          : panel === "pages"
            ? pagesPanel()
            : toolsPanel()}
      </Modal>
      <SignatureDialog
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onUse={(file, previewUrl) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setSignatureOpen(false);
          acceptImage(file, "signature");
        }}
      />
      <Modal
        open={Boolean(confirmation)}
        title={confirmation?.title || "Confirm change"}
        onClose={() => {
          if (!busy && !preparing) setConfirmation(null);
        }}
      >
        <p className="pdf-muted">{confirmation?.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <Button
            disabled={busy || preparing}
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </Button>
          <Button
            primary={!confirmation?.danger}
            danger={confirmation?.danger}
            disabled={busy || preparing}
            onClick={invoke(async () => {
              try {
                await confirmation.action();
                setConfirmation(null);
              } catch (e) {
                if (!operationRef.current?.error) toast.error(message(e));
              }
            })}
          >
            {busy ? "Working…" : confirmation?.label}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
