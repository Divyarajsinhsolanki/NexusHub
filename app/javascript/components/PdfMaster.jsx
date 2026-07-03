import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Document, Page } from "react-pdf";
import { useDropzone } from "react-dropzone";
import { toast } from "react-hot-toast";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  Eraser,
  FileArchive,
  FilePlus2,
  FileText,
  GripVertical,
  Highlighter,
  Image,
  Images,
  Library,
  Loader2,
  Lock,
  Merge,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  ShieldAlert,
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
  fetchPdfDocumentOperation,
  fetchPdfDocuments,
  redoPdfDocument,
  renamePdfDocument,
  restorePdfDocument,
  undoPdfDocument,
  uploadPdfDocument,
} from "./api";
import PdfDocumentCanvas from "./PdfDocumentCanvas";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SAMPLE_DOCUMENT = {
  id: "demo",
  title: "Nexus Hub sample",
  original_filename: "nexus-hub-sample.pdf",
  page_count: 1,
  encrypted: false,
  current_version_id: "demo",
  content_url: "/demo/nexus-hub-sample.pdf",
  download_url: "/demo/nexus-hub-sample.pdf",
};

const bytesLabel = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const draggablePortal = (node, isDragging) => (
  isDragging && typeof document !== "undefined" ? createPortal(node, document.body) : node
);

const dragItemStyle = (style, isDragging) => ({
  ...style,
  zIndex: isDragging ? 9999 : style?.zIndex,
  pointerEvents: isDragging ? "none" : style?.pointerEvents,
  boxShadow: isDragging ? "0 18px 32px -18px rgba(15, 23, 42, 0.45)" : style?.boxShadow,
});

const errorMessage = (error, fallback = "PDF action failed.") =>
  error?.response?.data?.error ||
  error?.response?.data?.errors?.join?.(", ") ||
  error?.message ||
  fallback;

const tools = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "text", label: "Text", icon: Type },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "watermark", label: "Watermark", icon: Stamp },
  { id: "signature", label: "Signature", icon: PenLine },
  { id: "stamp", label: "Stamp", icon: Image },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "redact", label: "Redact", icon: Eraser },
];

const LazyPageThumbnail = ({ pageNumber }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || visible) return undefined;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "240px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="flex min-h-[171px] items-center justify-center overflow-hidden rounded-lg bg-slate-100">
      {visible ? (
        <Page pageNumber={pageNumber} width={132} renderTextLayer={false} renderAnnotationLayer={false} />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
      )}
    </div>
  );
};

const PageOrganizer = ({
  documentRecord,
  pageOrder,
  setPageOrder,
  selectedPages,
  setSelectedPages,
  currentPage,
  setCurrentPage,
  onReorder,
  disabled,
}) => {
  const togglePage = (pageNumber) => {
    setSelectedPages((current) => {
      const next = new Set(current);
      next.has(pageNumber) ? next.delete(pageNumber) : next.add(pageNumber);
      return next;
    });
    setCurrentPage(pageNumber);
  };

  return (
    <Document
      file={`${documentRecord.content_url}?thumbnail=${documentRecord.current_version_id}`}
      loading={<div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /></div>}
    >
      <DragDropContext
        onDragEnd={(result) => {
          if (disabled || !result.destination) return;
          const next = [...pageOrder];
          const [moved] = next.splice(result.source.index, 1);
          next.splice(result.destination.index, 0, moved);
          setPageOrder(next);
          onReorder(next);
        }}
      >
        <Droppable droppableId="pdf-pages">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3 p-3">
              {pageOrder.map((pageNumber, index) => (
                <Draggable key={pageNumber} draggableId={`page-${pageNumber}`} index={index} isDragDisabled={disabled}>
                  {(dragProvided, snapshot) => {
                    const card = (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`group rounded-xl border bg-white p-2 shadow-sm transition-shadow ${
                          selectedPages.has(pageNumber) ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200"
                        } ${snapshot.isDragging ? "shadow-xl" : ""}`}
                        style={dragItemStyle(dragProvided.draggableProps.style, snapshot.isDragging)}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            {...dragProvided.dragHandleProps}
                            className="mt-8 text-slate-300 hover:text-slate-600"
                            aria-label={`Move page ${pageNumber}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => togglePage(pageNumber)} className="min-w-0 flex-1 text-left">
                            <LazyPageThumbnail pageNumber={pageNumber} />
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700">Page {pageNumber}</span>
                              {currentPage === pageNumber ? <span className="text-indigo-600">Viewing</span> : null}
                            </div>
                          </button>
                        </div>
                      </div>
                    );

                    return draggablePortal(card, snapshot.isDragging);
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
};

const PdfMaster = () => {
  const { user } = useContext(AuthContext);
  const isDemo = Boolean(user?.demo_account);
  const pollTimer = useRef(null);
  const [documents, setDocuments] = useState(isDemo ? [SAMPLE_DOCUMENT] : []);
  const [usage, setUsage] = useState({ document_count: 0, document_limit: 25, storage_bytes: 0, storage_limit_bytes: 1024 ** 3 });
  const [selectedId, setSelectedId] = useState(isDemo ? SAMPLE_DOCUMENT.id : null);
  const [loading, setLoading] = useState(!isDemo);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [leftTab, setLeftTab] = useState("library");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageOrder, setPageOrder] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState("select");
  const [shapes, setShapes] = useState([]);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [assetFile, setAssetFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [mergeIds, setMergeIds] = useState([]);
  const [mergeTitle, setMergeTitle] = useState("Merged document");
  const [splitSizeMb, setSplitSizeMb] = useState(10);
  const [password, setPassword] = useState("");
  const [mobilePanel, setMobilePanel] = useState("tools");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const selectedDocument = documents.find((document) => String(document.id) === String(selectedId)) || null;
  const selectedShape = shapes.find((shape) => shape.id === selectedShapeId) || null;
  const filteredDocuments = useMemo(
    () => isDemo
      ? documents.filter((document) =>
        `${document.title} ${document.original_filename}`.toLowerCase().includes(search.toLowerCase())
      )
      : documents,
    [documents, isDemo, search]
  );

  const loadDocuments = useCallback(async (preferredId, query = "") => {
    if (isDemo) return;
    const trimmedQuery = query.trim();
    const { data } = await fetchPdfDocuments(trimmedQuery ? { q: trimmedQuery } : {});
    setDocuments(data.documents || []);
    setUsage(data.usage || {});
    setSelectedId((current) => {
      const candidate = preferredId || current;
      return data.documents?.some((document) => String(document.id) === String(candidate))
        ? candidate
        : data.documents?.[0]?.id || null;
    });
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) return undefined;
    try {
      window.localStorage.removeItem("pdfUrl");
    } catch {
      // The persistent library does not depend on browser storage.
    }
    loadDocuments()
      .catch((error) => toast.error(errorMessage(error, "Could not load PDF library.")))
      .finally(() => setLoading(false));
    return () => window.clearTimeout(pollTimer.current);
  }, [isDemo, loadDocuments]);

  useEffect(() => {
    if (isDemo || loading) return undefined;

    const timer = window.setTimeout(() => {
      loadDocuments(undefined, search)
        .catch((error) => toast.error(errorMessage(error, "Could not search PDF library.")));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isDemo, loadDocuments, loading, search]);

  useEffect(() => {
    const count = selectedDocument?.page_count || 0;
    setPageOrder(Array.from({ length: count }, (_, index) => index + 1));
    setSelectedPages(new Set());
    setCurrentPage(1);
    setShapes([]);
    setSelectedShapeId(null);
    setArtifacts([]);
    setOperation(null);
  }, [selectedDocument?.id, selectedDocument?.current_version_id]);

  useEffect(() => {
    const handler = (event) => {
      if (!selectedDocument || busy || isDemo) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? handleHistory("redo") : handleHistory("undo");
      }
      if (event.key === "Delete" && selectedShapeId) {
        setShapes((current) => current.filter((shape) => shape.id !== selectedShapeId));
        setSelectedShapeId(null);
      }
      if (event.key === "Escape") {
        setActiveTool("select");
        setSelectedShapeId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const updateSelectedDocument = (nextDocument) => {
    if (!nextDocument) return;
    setDocuments((current) => current.map((document) =>
      String(document.id) === String(nextDocument.id) ? nextDocument : document
    ));
  };

  const completeOperation = async (nextOperation) => {
    setOperation(nextOperation);
    setArtifacts(nextOperation.artifacts || []);
    if (nextOperation.status === "failed") throw new Error(nextOperation.error || "PDF operation failed.");
    if (nextOperation.status !== "completed") return false;

    if (nextOperation.document) updateSelectedDocument(nextOperation.document);
    const preferredId = nextOperation.result?.document_id || nextOperation.result?.document_ids?.[0] || selectedId;
    await loadDocuments(preferredId, search);
    toast.success("PDF operation completed.");
    return true;
  };

  const pollOperation = async (id, attempt = 0) => {
    if (attempt >= 250) {
      throw new Error("This operation is taking longer than expected. Check its status again later.");
    }
    const { data } = await fetchPdfDocumentOperation(id);
    if (await completeOperation(data)) return data;

    await new Promise((resolve) => {
      pollTimer.current = window.setTimeout(resolve, 1200);
    });
    return pollOperation(id, attempt + 1);
  };

  const runOperation = async (kind, parameters = {}, options = {}) => {
    if (isDemo) return null;
    setBusy(true);
    setArtifacts([]);
    try {
      const payload = {
        kind,
        pdf_document_id: options.documentId === null ? undefined : (options.documentId || selectedDocument?.id),
        base_version_id: options.baseVersionId === null ? undefined : (options.baseVersionId || selectedDocument?.current_version_id),
        parameters,
        ...(options.password ? { password: options.password } : {}),
      };
      const { data } = await createPdfDocumentOperation(payload, options.asset);
      setOperation(data);
      if (data.status === "completed") {
        await completeOperation(data);
        return data;
      }
      return await pollOperation(data.id);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handlePageReorder = async (order) => {
    try {
      await runOperation("reorder_pages", { page_order: order });
    } catch {
      setPageOrder(Array.from({ length: selectedDocument?.page_count || 0 }, (_, index) => index + 1));
    }
  };

  const handleMergeReorder = (result) => {
    if (!result.destination) return;
    setMergeIds((current) => {
      const next = [...current];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination.index, 0, moved);
      return next;
    });
  };

  const handleHistory = async (direction) => {
    if (!selectedDocument || isDemo) return;
    setBusy(true);
    try {
      const request = direction === "undo" ? undoPdfDocument : redoPdfDocument;
      const { data } = await request(selectedDocument.id);
      updateSelectedDocument(data);
      toast.success(direction === "undo" ? "Change undone." : "Change redone.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (files) => {
    if (isDemo) return;
    const accepted = Array.from(files || []).filter((file) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is larger than 50MB.`);
        return false;
      }
      return true;
    });
    if (!accepted.length) return;

    setUploading(true);
    try {
      let lastId = null;
      for (const file of accepted) {
        const { data } = await uploadPdfDocument(file, "", (event) => {
          setUploadProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0);
        });
        lastId = data.id;
      }
      await loadDocuments(lastId, search);
      toast.success(`${accepted.length} PDF${accepted.length === 1 ? "" : "s"} saved.`);
    } catch (error) {
      toast.error(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const dropzone = useDropzone({
    onDrop: handleUpload,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_UPLOAD_BYTES,
    multiple: true,
    disabled: uploading || isDemo,
  });

  const applyStagedChanges = async () => {
    const redactions = shapes.filter((shape) => shape.type === "redact");
    const crops = shapes.filter((shape) => shape.type === "crop");
    const imageShapes = shapes.filter((shape) => ["signature", "stamp"].includes(shape.type));
    const annotations = shapes.filter((shape) => !["redact", "crop", "signature", "stamp"].includes(shape.type));
    const operationGroups = [redactions, crops, imageShapes, annotations].filter((group) => group.length);

    if (operationGroups.length > 1) {
      toast.error("Apply one edit type at a time to keep document versions consistent.");
      return;
    }

    if (redactions.length) {
      const confirmed = window.confirm(
        "Secure redaction rasterizes affected pages. Searchable text and interactive elements on those pages will be removed. Continue?"
      );
      if (!confirmed) return;
      await runOperation("redact", { regions: redactions });
    } else if (crops.length) {
      if (crops.length > 1) {
        toast.error("Apply one crop area at a time.");
        return;
      }
      await runOperation("crop", crops[0]);
    } else if (annotations.length) {
      await runOperation("annotations", { shapes: annotations });
    } else if (imageShapes.length) {
      if (!assetFile) {
        toast.error("Choose an image for the signature or stamp.");
        return;
      }
      if (imageShapes.length > 1) {
        toast.error("Apply one signature or stamp at a time.");
        return;
      }
      await runOperation("image", imageShapes[0], { asset: assetFile });
    }
    setShapes([]);
    setSelectedShapeId(null);
    setAssetFile(null);
    setActiveTool("select");
  };

  const selectedPageNumbers = [...selectedPages].sort((a, b) => a - b);

  const updateShape = (changes) => {
    if (!selectedShapeId) return;
    setShapes((current) => current.map((shape) =>
      shape.id === selectedShapeId ? { ...shape, ...changes } : shape
    ));
  };

  const storagePercent = Math.min(100, ((usage.storage_bytes || 0) / (usage.storage_limit_bytes || 1)) * 100);

  if (loading) {
    return (
      <div className="flex h-full min-h-[70vh] items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 w-full flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-white shadow-2xl shadow-slate-900/10">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">PDF Master</p>
            <p className="truncate text-sm font-bold text-slate-900">{selectedDocument?.title || "Personal document library"}</p>
          </div>
        </div>

        {selectedDocument ? (
          <div className="flex items-center gap-1.5">
            {!isDemo ? (
              <>
                <button type="button" disabled={busy || !selectedDocument.can_undo} onClick={() => handleHistory("undo")} className="toolbar-button" title="Undo (Ctrl+Z)" aria-label="Undo last PDF change">
                  <Undo2 className="h-4 w-4" />
                </button>
                <button type="button" disabled={busy || !selectedDocument.can_redo} onClick={() => handleHistory("redo")} className="toolbar-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo PDF change">
                  <Redo2 className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <a href={selectedDocument.download_url} className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">
              <Download className="mr-1.5 h-4 w-4" /> Download
            </a>
          </div>
        ) : null}
      </header>

      {isDemo ? (
        <div className="shrink-0 border-b border-cyan-200 bg-cyan-50 px-4 py-2 text-center text-xs font-semibold text-cyan-900">
          Read-only sample. Sign in with a regular account to save and edit documents.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 lg:flex">
          <div className="grid grid-cols-2 border-b border-slate-200 bg-white p-2">
            {[
              ["library", Library, "Library"],
              ["pages", Images, "Pages"],
            ].map(([id, Icon, label]) => (
              <button key={id} type="button" onClick={() => setLeftTab(id)} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${leftTab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {leftTab === "library" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {!isDemo ? (
                <div className="space-y-3 border-b border-slate-200 p-3">
                  <div {...dropzone.getRootProps()} className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${dropzone.isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-300"}`}>
                    <input {...dropzone.getInputProps()} />
                    {uploading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-600" /> : <Upload className="mx-auto h-5 w-5 text-indigo-600" />}
                    <p className="mt-2 text-xs font-bold text-slate-700">{uploading ? `Uploading ${uploadProgress}%` : "Upload PDFs"}</p>
                    <p className="mt-1 text-[10px] text-slate-400">Up to 50MB each</p>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500">
                      <span>{usage.document_count || 0}/{usage.document_limit || 25} documents</span>
                      <span>{bytesLabel(usage.storage_bytes)} / 1 GB</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${storagePercent}%` }} />
                    </div>
                  </div>
                  <label className="relative block">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" />
                  </label>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {filteredDocuments.map((document) => (
                  <button key={document.id} type="button" onClick={() => setSelectedId(document.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${String(selectedId) === String(document.id) ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-200"}`}>
                    <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                      {document.thumbnail_url ? <img src={document.thumbnail_url} alt="" className="h-full w-full object-cover" /> : document.encrypted ? <Lock className="h-5 w-5 text-slate-400" /> : <FileText className="h-5 w-5 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800">{document.title}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{document.page_count || "Locked"} pages · {bytesLabel(document.byte_size)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : selectedDocument && !selectedDocument.encrypted ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PageOrganizer
                documentRecord={selectedDocument}
                pageOrder={pageOrder}
                setPageOrder={setPageOrder}
                selectedPages={selectedPages}
                setSelectedPages={setSelectedPages}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                onReorder={handlePageReorder}
                disabled={busy}
              />
            </div>
          ) : (
            <p className="p-6 text-center text-xs text-slate-500">Unlock this PDF to view its pages.</p>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
          {selectedDocument ? (
            <>
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {tools.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" disabled={isDemo || selectedDocument.encrypted || busy} onClick={() => { setActiveTool(id); setMobilePanel("tools"); }} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${activeTool === id ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"} disabled:cursor-not-allowed disabled:opacity-40`} title={label} aria-label={`${label} tool`}>
                      <Icon className="h-4 w-4" /><span className="hidden xl:inline">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} className="toolbar-button" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
                  <span className="w-11 text-center text-[10px] font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} className="toolbar-button" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
                </div>
              </div>

              {selectedDocument.encrypted ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-xl">
                    <Lock className="mx-auto h-10 w-10 text-amber-500" />
                    <h2 className="mt-4 text-lg font-black text-slate-900">Password-protected PDF</h2>
                    <p className="mt-2 text-sm text-slate-500">Enter the password to create an unlocked version for editing.</p>
                    {!isDemo ? (
                      <div className="mt-5 flex gap-2">
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="PDF password" />
                        <button type="button" disabled={busy || !password} onClick={() => runOperation("unlock", {}, { password }).then(() => setPassword(""))} className="rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white">Unlock</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <PdfDocumentCanvas
                    documentRecord={selectedDocument}
                    pageNumber={currentPage}
                    zoom={zoom}
                    activeTool={isDemo ? null : activeTool}
                    shapes={shapes}
                    setShapes={setShapes}
                    selectedShapeId={selectedShapeId}
                    setSelectedShapeId={setSelectedShapeId}
                    onDocumentLoaded={(count) => {
                      if (!pageOrder.length) setPageOrder(Array.from({ length: count }, (_, index) => index + 1));
                    }}
                  />
                  <div className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-slate-200 bg-white">
                    <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => page - 1)} className="toolbar-button" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="text-xs font-bold text-slate-600">Page {currentPage} of {selectedDocument.page_count || pageOrder.length}</span>
                    <button type="button" disabled={currentPage >= (selectedDocument.page_count || pageOrder.length)} onClick={() => setCurrentPage((page) => page + 1)} className="toolbar-button" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-lg text-center">
                <FilePlus2 className="mx-auto h-12 w-12 text-indigo-500" />
                <h2 className="mt-4 text-2xl font-black text-slate-900">Add your first PDF</h2>
                <p className="mt-2 text-sm text-slate-500">Documents stay in your personal library until you delete them.</p>
                {!isDemo ? (
                  <button type="button" onClick={dropzone.open} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white"><Upload className="mr-2 inline h-4 w-4" />Choose PDF</button>
                ) : null}
              </div>
            </div>
          )}
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">Document tools</h2>
            <p className="mt-0.5 text-xs text-slate-500">Edit the selected document or staged object.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {busy && operation ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700"><Loader2 className="h-4 w-4 animate-spin" />{operation.kind.replaceAll("_", " ")}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100"><div className="h-full bg-indigo-600" style={{ width: `${operation.progress || 10}%` }} /></div>
              </div>
            ) : null}

            {shapes.length ? (
              <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-indigo-700">Staged changes</p>
                  <button type="button" onClick={() => { setShapes([]); setSelectedShapeId(null); }} className="text-xs font-bold text-rose-600">Clear</button>
                </div>
                <p className="text-xs text-slate-600">{shapes.length} object{shapes.length === 1 ? "" : "s"} will be flattened into a new PDF version.</p>
                {selectedShape ? (
                  <div className="grid grid-cols-2 gap-2">
                    {["x", "y", "width", "height"].filter((key) => selectedShape[key] !== undefined).map((key) => (
                      <label key={key} className="text-[10px] font-bold uppercase text-slate-500">
                        {key}
                        <input type="number" value={Math.round(selectedShape[key])} onChange={(event) => updateShape({ [key]: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" />
                      </label>
                    ))}
                    {["text", "watermark"].includes(selectedShape.type) ? (
                      <>
                        <label className="col-span-2 text-[10px] font-bold uppercase text-slate-500">Text<input value={selectedShape.text || ""} onChange={(event) => updateShape({ text: event.target.value })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs normal-case" /></label>
                        <label className="text-[10px] font-bold uppercase text-slate-500">Size<input type="number" min="8" max="96" value={selectedShape.font_size || 18} onChange={(event) => updateShape({ font_size: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs" /></label>
                      </>
                    ) : null}
                    <label className="text-[10px] font-bold uppercase text-slate-500">Color<input type="color" value={selectedShape.color || "#dc2626"} onChange={(event) => updateShape({ color: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1" /></label>
                  </div>
                ) : null}
                {shapes.some((shape) => ["signature", "stamp"].includes(shape.type)) ? (
                  <input type="file" accept="image/png,image/jpeg" onChange={(event) => setAssetFile(event.target.files?.[0] || null)} className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-indigo-100 file:px-2 file:py-1.5 file:font-bold file:text-indigo-700" />
                ) : null}
                <button type="button" disabled={busy} onClick={applyStagedChanges} className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Save className="mr-2 h-4 w-4" />Apply changes</button>
              </div>
            ) : null}

            {selectedDocument && !isDemo ? (
              <>
                <section className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Document</h3>
                  <input
                    value={selectedDocument.title}
                    onChange={(event) => updateSelectedDocument({ ...selectedDocument, title: event.target.value })}
                    onBlur={() => renamePdfDocument(selectedDocument.id, selectedDocument.title)
                      .then(({ data }) => updateSelectedDocument(data))
                      .catch((error) => {
                        toast.error(errorMessage(error));
                        loadDocuments(selectedDocument.id);
                      })}
                    aria-label="Document title"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("compress")} className="inspector-button"><FileArchive className="h-4 w-4" />Compress</button>
                    <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("extract_text")} className="inspector-button"><FileText className="h-4 w-4" />Text</button>
                    <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("export_images")} className="inspector-button"><Images className="h-4 w-4" />Images</button>
                    <button type="button" disabled={busy} onClick={() => restorePdfDocument(selectedDocument.id).then(({ data }) => updateSelectedDocument(data)).catch((error) => toast.error(errorMessage(error)))} className="inspector-button"><RotateCcw className="h-4 w-4" />Original</button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Selected pages</h3>
                  <p className="text-xs text-slate-500">{selectedPageNumbers.length ? selectedPageNumbers.join(", ") : "Select pages from the Pages tab."}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("rotate_pages", { page_numbers: selectedPageNumbers, degrees: 270 })} className="inspector-button"><RotateCcw className="h-4 w-4" />Left</button>
                    <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("rotate_pages", { page_numbers: selectedPageNumbers, degrees: 90 })} className="inspector-button"><RotateCw className="h-4 w-4" />Right</button>
                    <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("duplicate_pages", { page_numbers: selectedPageNumbers })} className="inspector-button"><Plus className="h-4 w-4" />Duplicate</button>
                    <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("extract_pages", { page_numbers: selectedPageNumbers })} className="inspector-button"><Scissors className="h-4 w-4" />Extract</button>
                    <button type="button" disabled={busy} onClick={() => runOperation("add_blank_page", { position: currentPage + 1, reference_page_number: currentPage })} className="inspector-button"><FilePlus2 className="h-4 w-4" />Blank page</button>
                    <button type="button" disabled={busy || !selectedPageNumbers.length || selectedPageNumbers.length >= selectedDocument.page_count} onClick={() => window.confirm(`Delete ${selectedPageNumbers.length} selected page(s)?`) && runOperation("delete_pages", { page_numbers: selectedPageNumbers })} className="inspector-button text-rose-600"><Trash2 className="h-4 w-4" />Delete</button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Security</h3>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <button type="button" disabled={busy || password.length < 8 || selectedDocument.encrypted} onClick={() => runOperation("protect", {}, { password }).then(() => setPassword(""))} className="flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Lock className="mr-2 h-4 w-4" />Protect PDF</button>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Merge documents</h3>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {documents.map((document) => (
                      <label key={document.id} className={`flex items-center gap-2 text-xs ${document.encrypted ? "text-slate-300" : "text-slate-600"}`}>
                        <input type="checkbox" disabled={document.encrypted} checked={mergeIds.includes(document.id)} onChange={(event) => setMergeIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} />
                        <span className="truncate">{document.title}</span>
                      </label>
                    ))}
                  </div>
                  {mergeIds.length ? (
                    <DragDropContext onDragEnd={handleMergeReorder}>
                      <Droppable droppableId="merge-order">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                            {mergeIds.map((id, index) => {
                              const document = documents.find((item) => item.id === id);
                              return (
                                <Draggable key={id} draggableId={`merge-${id}`} index={index} isDragDisabled={busy}>
                                  {(dragProvided, snapshot) => {
                                    const item = (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                        {...dragProvided.dragHandleProps}
                                        className={`flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600 ${snapshot.isDragging ? "ring-2 ring-indigo-500" : ""}`}
                                        style={dragItemStyle(dragProvided.draggableProps.style, snapshot.isDragging)}
                                      >
                                        <GripVertical className="h-3.5 w-3.5 text-slate-300" />
                                        <span className="min-w-0 flex-1 truncate">{index + 1}. {document?.title}</span>
                                      </div>
                                    );

                                    return draggablePortal(item, snapshot.isDragging);
                                  }}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  ) : null}
                  <input value={mergeTitle} onChange={(event) => setMergeTitle(event.target.value)} maxLength={160} aria-label="Merged document title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                  <button type="button" disabled={busy || mergeIds.length < 2 || !mergeTitle.trim()} onClick={() => runOperation("merge", { document_ids: mergeIds, title: mergeTitle.trim() }, { documentId: null, baseVersionId: null }).then(() => setMergeIds([]))} className="flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Merge className="mr-2 h-4 w-4" />Merge in this order</button>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Split by size</h3>
                  <div className="flex gap-2">
                    <input type="number" min="1" max="50" value={splitSizeMb} onChange={(event) => setSplitSizeMb(Number(event.target.value))} aria-label="Maximum split file size in megabytes" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                    <span className="flex items-center text-xs font-bold text-slate-500">MB</span>
                  </div>
                  <button type="button" disabled={busy || selectedDocument.encrypted || splitSizeMb < 1 || splitSizeMb > 50} onClick={() => runOperation("split_by_size", { max_size_mb: splitSizeMb })} className="flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Scissors className="mr-2 h-4 w-4" />Create split documents</button>
                </section>

                {artifacts.length ? (
                  <section className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Generated files</h3>
                    {artifacts.map((artifact) => (
                      <a key={artifact.id} href={artifact.download_url} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                        <span className="truncate">{artifact.filename}</span><ArrowDownToLine className="h-4 w-4" />
                      </a>
                    ))}
                  </section>
                ) : null}

                <button type="button" onClick={() => window.confirm(`Delete "${selectedDocument.title}" and all saved versions?`) && deletePdfDocument(selectedDocument.id).then(() => loadDocuments()).catch((error) => toast.error(errorMessage(error)))} className="flex w-full items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="mr-2 h-4 w-4" />Delete document</button>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="grid shrink-0 grid-cols-3 border-t border-slate-200 bg-white xl:hidden">
        {[
          ["library", Library],
          ["pages", Images],
          ["tools", Save],
        ].map(([id, Icon]) => (
          <button key={id} type="button" onClick={() => { setMobilePanel(id); setMobilePanelOpen(true); }} className={`flex items-center justify-center gap-2 py-3 text-xs font-bold capitalize ${mobilePanel === id && mobilePanelOpen ? "text-indigo-600" : "text-slate-400"}`}><Icon className="h-4 w-4" />{id}</button>
        ))}
      </div>

      {mobilePanelOpen ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/30 xl:hidden" onClick={() => setMobilePanelOpen(false)}>
          <section
            className="absolute inset-x-2 bottom-2 max-h-[72dvh] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-black capitalize text-slate-900">{mobilePanel}</h2>
              <button type="button" onClick={() => setMobilePanelOpen(false)} className="toolbar-button" aria-label="Close panel"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[calc(72dvh-3.5rem)] overflow-y-auto p-3">
              {mobilePanel === "library" ? (
                <div className="space-y-3">
                  {!isDemo ? (
                    <button type="button" onClick={dropzone.open} disabled={uploading} className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 px-4 py-4 text-sm font-bold text-indigo-700">
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploading ? `Uploading ${uploadProgress}%` : "Upload PDFs"}
                    </button>
                  ) : null}
                  {!isDemo ? (
                    <>
                      <label className="relative block">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" aria-label="Search documents" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs" />
                      </label>
                      <p className="text-xs font-semibold text-slate-500">{usage.document_count || 0}/{usage.document_limit || 25} documents · {bytesLabel(usage.storage_bytes)} / 1 GB</p>
                    </>
                  ) : null}
                  {filteredDocuments.map((document) => (
                    <button key={document.id} type="button" onClick={() => { setSelectedId(document.id); setMobilePanelOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${String(selectedId) === String(document.id) ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                      {document.encrypted ? <Lock className="h-5 w-5 text-amber-500" /> : <FileText className="h-5 w-5 text-indigo-500" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{document.title}</span>
                      <span className="text-xs text-slate-400">{document.page_count || "Locked"}p</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {mobilePanel === "pages" && selectedDocument && !selectedDocument.encrypted ? (
                <PageOrganizer
                  documentRecord={selectedDocument}
                  pageOrder={pageOrder}
                  setPageOrder={setPageOrder}
                  selectedPages={selectedPages}
                  setSelectedPages={setSelectedPages}
                  currentPage={currentPage}
                  setCurrentPage={(page) => { setCurrentPage(page); setMobilePanelOpen(false); }}
                  onReorder={handlePageReorder}
                  disabled={busy}
                />
              ) : null}

              {mobilePanel === "tools" ? (
                <div className="space-y-4">
                  {shapes.length ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                      <p className="text-sm font-bold text-indigo-800">{shapes.length} staged object{shapes.length === 1 ? "" : "s"}</p>
                      {shapes.some((shape) => ["signature", "stamp"].includes(shape.type)) ? (
                        <input type="file" accept="image/png,image/jpeg" onChange={(event) => setAssetFile(event.target.files?.[0] || null)} className="mt-3 w-full text-xs" />
                      ) : null}
                      <button type="button" disabled={busy} onClick={() => applyStagedChanges().then(() => setMobilePanelOpen(false))} className="mt-3 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Save className="mr-2 h-4 w-4" />Apply changes</button>
                    </div>
                  ) : null}
                  {selectedDocument && !isDemo ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("compress")} className="inspector-button"><FileArchive className="h-4 w-4" />Compress</button>
                      <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("export_images")} className="inspector-button"><Images className="h-4 w-4" />Export</button>
                      <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("rotate_pages", { page_numbers: selectedPageNumbers, degrees: 90 })} className="inspector-button"><RotateCw className="h-4 w-4" />Rotate</button>
                      <button type="button" disabled={busy || !selectedPageNumbers.length} onClick={() => runOperation("extract_pages", { page_numbers: selectedPageNumbers })} className="inspector-button"><Scissors className="h-4 w-4" />Extract</button>
                      <button type="button" disabled={busy || selectedDocument.encrypted} onClick={() => runOperation("split_by_size", { max_size_mb: splitSizeMb })} className="inspector-button"><Scissors className="h-4 w-4" />Split</button>
                    </div>
                  ) : null}
                  {artifacts.map((artifact) => (
                    <a key={artifact.id} href={artifact.download_url} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                      <span className="truncate">{artifact.filename}</span><Download className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default PdfMaster;
