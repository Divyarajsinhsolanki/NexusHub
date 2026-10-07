// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  documents: [],
  version: 100,
  failSave: false,
}));
const notifications = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("react-hot-toast", () => ({ toast: notifications }));
vi.mock("react-pdf", () => ({
  Document: ({ children, file, onLoadSuccess }) => {
    React.useEffect(() => {
      onLoadSuccess?.({
        numPages: 4,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [{ str: "Product brief searchable phrase" }],
          }),
        }),
      });
    }, [file]);
    return <div>{children}</div>;
  },
  Page: ({ pageNumber, width, onLoadSuccess, onRenderSuccess }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ getViewport: () => ({ width: 612, height: 792 }) });
      onRenderSuccess?.();
    }, [pageNumber, width]);
    return <div>PDF page</div>;
  },
  pdfjs: { GlobalWorkerOptions: {} },
}));
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }) => <div>{children}</div>,
  Droppable: ({ children }) =>
    children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
  Draggable: ({ children }) =>
    children(
      { innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} },
      {},
    ),
}));
vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: vi.fn(),
  }),
}));
vi.mock("./api", () => ({
  fetchPdfDocuments: vi.fn(),
  fetchPdfDocument: vi.fn(),
  fetchPdfDocumentOperations: vi.fn(),
  createPdfDocumentOperation: vi.fn(),
  deletePdfDocument: vi.fn(),
  fetchPdfDocumentOperation: vi.fn(),
  redoPdfDocument: vi.fn(),
  renamePdfDocument: vi.fn(),
  restorePdfDocument: vi.fn(),
  undoPdfDocument: vi.fn(),
  uploadPdfDocument: vi.fn(),
}));
vi.mock("../context/AuthContext", async () => ({
  AuthContext: (await import("react")).createContext({ user: null }),
}));
import { AuthContext } from "../context/AuthContext";
import * as api from "./api";
import PdfMaster, { parsePageRange } from "./PdfMaster";
const record = (patch = {}) => ({
  id: 42,
  title: "Product brief",
  original_filename: "brief.pdf",
  page_count: 4,
  encrypted: false,
  current_version_id: 77,
  can_undo: false,
  can_redo: false,
  content_url: "/api/pdf_documents/42/content",
  download_url: "/api/pdf_documents/42/download",
  byte_size: 1200,
  editor_state: { layer_id: 4, background_url: "/background.pdf", objects: [] },
  ...patch,
});
const setup = (demo = false) =>
  render(
    <AuthContext.Provider value={{ user: { id: 1, demo_account: demo } }}>
      <PdfMaster />
    </AuthContext.Provider>,
  );
const open = async (doc = record()) => {
  fixture.documents = [doc];
  setup();
  await screen.findByRole("heading", { name: doc.title });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Text tool" }).disabled).toBe(
      doc.encrypted,
    ),
  );
};
const group = async (name) =>
  userEvent.click(
    screen
      .getByRole("navigation", { name: "PDF tool groups" })
      .querySelector(
        `button:nth-child(${["Edit", "Annotate", "Pages", "Secure", "Export"].indexOf(name) + 1})`,
      ),
  );
const svgBounds = () => {
  const svg = document.querySelector(".nexus-pdf-page svg");
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 612,
    height: 792,
  });
  return svg;
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fixture.documents = [];
  fixture.version = 100;
  fixture.failSave = false;
  window.history.replaceState({}, "", "/pdf-master");
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
  api.fetchPdfDocuments.mockImplementation(async () => ({
    data: {
      documents: fixture.documents,
      usage: {
        document_count: fixture.documents.length,
        document_limit: 25,
        storage_bytes: 1200,
        storage_limit_bytes: 1073741824,
      },
    },
  }));
  api.fetchPdfDocumentOperations.mockResolvedValue({
    data: { operations: [] },
  });
  api.fetchPdfDocument.mockImplementation(async (id) => ({
    data: fixture.documents.find((doc) => String(doc.id) === String(id)),
  }));
  api.createPdfDocumentOperation.mockImplementation(async (payload) => {
    if (fixture.failSave && payload.kind === "save_objects")
      throw new Error("Network unavailable");
    const doc = fixture.documents.find(
      (doc) => doc.id === payload.pdf_document_id,
    );
    const updated = doc
      ? {
          ...doc,
          current_version_id: ++fixture.version,
          can_undo: true,
          editor_state: {
            ...doc.editor_state,
            objects:
              payload.parameters.objects || doc.editor_state?.objects || [],
          },
        }
      : null;
    if (updated)
      fixture.documents = fixture.documents.map((d) =>
        d.id === updated.id ? updated : d,
      );
    return {
      data: {
        id: 9,
        kind: payload.kind,
        status: "completed",
        progress: 100,
        result: {},
        artifacts: [],
        document: updated,
      },
    };
  });
});
afterEach(cleanup);

describe("PDF Master workspace", () => {
  it("renders the persistent library empty state without duplicate requests", async () => {
    setup();
    expect(await screen.findByText("Add your first PDF")).toBeTruthy();
    expect(
      screen.getByText(
        "Documents stay in your personal library until you delete them.",
      ),
    ).toBeTruthy();
    expect(api.fetchPdfDocuments).toHaveBeenCalledTimes(1);
  });
  it("allows retry after the library fails", async () => {
    api.fetchPdfDocuments.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    setup();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Network unavailable",
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Add your first PDF")).toBeTruthy();
  });
  it("organizes tools by task and loads editable objects from document detail", async () => {
    await open(
      record({
        editor_state: {
          layer_id: 4,
          background_url: "/background.pdf",
          objects: [
            {
              id: "note",
              type: "text",
              page_number: 1,
              x: 40,
              y: 50,
              width: 180,
              height: 48,
              text: "Saved addition",
              font_size: 16,
            },
          ],
        },
      }),
    );
    expect(screen.getByLabelText(/text content/i).value).toBe("Saved addition");
    expect(screen.queryByRole("button", { name: "Compress PDF" })).toBeNull();
    expect(api.createPdfDocumentOperation).not.toHaveBeenCalled();
    await group("Export");
    expect(screen.getByRole("button", { name: "Compress PDF" })).toBeTruthy();
  });
  it("runs export operations against the selected version", async () => {
    await open();
    await group("Export");
    await userEvent.click(screen.getByRole("button", { name: "Compress PDF" }));
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        {
          kind: "compress",
          pdf_document_id: 42,
          base_version_id: 77,
          parameters: {},
        },
        undefined,
      ),
    );
  });
  it("does not roll back autosave acknowledgements when a rename finishes later", async () => {
    const doc = record({
      editor_state: {
        layer_id: 4,
        background_url: "/background.pdf",
        objects: [
          {
            id: "note",
            type: "text",
            page_number: 1,
            x: 40,
            y: 50,
            width: 180,
            height: 48,
            text: "Before",
            font_size: 16,
          },
        ],
      },
    });
    await open(doc);
    await group("Export");
    await userEvent.click(screen.getByText("Document settings"));
    let finishRename;
    api.renamePdfDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRename = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Document title"), {
      target: { value: "Renamed brief" },
    });
    fireEvent.blur(screen.getByLabelText("Document title"));
    fireEvent.change(screen.getByLabelText(/text content/i), {
      target: { value: "First edit" },
    });
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledTimes(1),
    );
    finishRename({ data: { ...doc, title: "Renamed brief" } });
    await screen.findByRole("heading", { name: "Renamed brief" });
    fireEvent.change(screen.getByLabelText(/text content/i), {
      target: { value: "Second edit" },
    });
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledTimes(2),
    );
    expect(
      api.createPdfDocumentOperation.mock.calls[1][0].base_version_id,
    ).toBe(101);
    expect(screen.getByRole("heading", { name: "Renamed brief" })).toBeTruthy();
  });
  it("ignores image decoding that finishes after switching documents", async () => {
    const doc = record(),
      other = record({ id: 43, title: "Another document" });
    fixture.documents = [doc, other];
    setup();
    await screen.findByRole("heading", { name: doc.title });
    const image = { naturalWidth: 40, naturalHeight: 20 };
    const previousImage = window.Image;
    const createUrl = URL.createObjectURL,
      revokeUrl = URL.revokeObjectURL;
    window.Image = function () {
      return image;
    };
    URL.createObjectURL = vi.fn(() => "blob:pending-image");
    URL.revokeObjectURL = vi.fn();
    try {
      fireEvent.change(screen.getByLabelText("Upload object image"), {
        target: {
          files: [new File(["image"], "image.png", { type: "image/png" })],
        },
      });
      await userEvent.click(
        screen.getByRole("button", { name: /Another document.*pages/ }),
      );
      await screen.findByRole("heading", { name: other.title });
      image.onload();
      await waitFor(() =>
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pending-image"),
      );
      expect(
        screen
          .getByRole("button", { name: "Select tool" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(api.createPdfDocumentOperation).not.toHaveBeenCalled();
    } finally {
      window.Image = previousImage;
      URL.createObjectURL = createUrl;
      URL.revokeObjectURL = revokeUrl;
    }
  });
  it("keeps page jumps integral and preserves router history state", async () => {
    window.history.replaceState(
      { idx: 3, key: "route", usr: { source: "library" } },
      "",
      "/pdf-master",
    );
    await open();
    expect(window.history.state).toEqual({
      idx: 3,
      key: "route",
      usr: { source: "library" },
    });
    fireEvent.change(screen.getByLabelText("Current page"), {
      target: { value: "2.5" },
    });
    expect(screen.getByLabelText("Current page").value).toBe("2");
  });
  it("shares page tools with the responsive dialog and restores focus", async () => {
    await open();
    await group("Pages");
    const trigger = screen.getByRole("button", { name: /^tools$/i });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Tools" });
    const merge = within(dialog).getByText("Merge PDFs").closest("details"),
      split = within(dialog).getByText("Split PDF").closest("details");
    expect(merge.open).toBe(false);
    expect(split.open).toBe(false);
    await userEvent.click(split.querySelector("summary"));
    expect(split.open).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("exposes unlock in the mobile tools dialog", async () => {
    await open(record({ encrypted: true }));
    await userEvent.click(screen.getByRole("button", { name: /^tools$/i }));
    const dialog = screen.getByRole("dialog", { name: "Tools" });
    expect(within(dialog).getByText("Password-protected PDF")).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText("PDF password"),
      "password123",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Unlock PDF" }),
    );
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "unlock",
          password: "password123",
          base_version_id: 77,
        }),
        undefined,
      ),
    );
  });
  it("autosaves text and retains the selected object after an acknowledgement", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Text tool" }));
    fireEvent.pointerDown(svgBounds(), {
      pointerId: 2,
      clientX: 40,
      clientY: 50,
    });
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "save_objects",
          parameters: {
            objects: [expect.objectContaining({ type: "text", x: 40, y: 50 })],
          },
        }),
        undefined,
      ),
    );
    expect(screen.getByLabelText(/text content/i)).toBeTruthy();
    expect(screen.getByText("Text properties")).toBeTruthy();
  });
  it("retains failed additions and retries rather than clearing the document", async () => {
    fixture.failSave = true;
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Text tool" }));
    fireEvent.pointerDown(svgBounds(), {
      pointerId: 2,
      clientX: 40,
      clientY: 50,
    });
    await screen.findByRole("alert");
    expect(screen.getByLabelText(/text content/i)).toBeTruthy();
    fixture.failSave = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("does not acknowledge another request's version as its own saved snapshot", async () => {
    const note = {
      id: "note",
      type: "text",
      page_number: 1,
      x: 40,
      y: 50,
      width: 180,
      height: 48,
      text: "Before",
      font_size: 16,
    };
    const doc = record({
      editor_state: {
        layer_id: 4,
        background_url: "/background.pdf",
        objects: [note],
      },
    });
    await open(doc);
    api.createPdfDocumentOperation.mockResolvedValueOnce({
      data: {
        id: 9,
        kind: "save_objects",
        status: "completed",
        result: { version_id: 101 },
        document: { ...doc, current_version_id: 102 },
      },
    });
    fireEvent.change(screen.getByLabelText(/text content/i), {
      target: { value: "Keep local edit" },
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "document changed in another request",
    );
    expect(screen.getByLabelText(/text content/i).value).toBe(
      "Keep local edit",
    );
  });
  it("flushes before undo and serializes repeated clicks during a save", async () => {
    const note = {
      id: "note",
      type: "text",
      page_number: 1,
      x: 40,
      y: 50,
      width: 180,
      height: 48,
      text: "Before",
      font_size: 16,
    };
    const doc = record({
      can_undo: true,
      editor_state: {
        layer_id: 4,
        background_url: "/background.pdf",
        objects: [note],
      },
    });
    await open(doc);
    const saveOperation =
      api.createPdfDocumentOperation.getMockImplementation();
    let releaseSave;
    api.createPdfDocumentOperation.mockImplementationOnce(async (payload) => {
      await new Promise((resolve) => {
        releaseSave = resolve;
      });
      return saveOperation(payload);
    });
    api.undoPdfDocument.mockResolvedValue({ data: doc });
    fireEvent.change(screen.getByLabelText(/text content/i), {
      target: { value: "After" },
    });
    const undo = screen.getByRole("button", { name: "Undo last PDF change" });
    fireEvent.click(undo);
    fireEvent.click(undo);
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledTimes(1),
    );
    expect(api.undoPdfDocument).not.toHaveBeenCalled();
    releaseSave();
    await waitFor(() => expect(api.undoPdfDocument).toHaveBeenCalledTimes(1));
    expect(api.createPdfDocumentOperation.mock.calls[0][0]).toMatchObject({
      kind: "save_objects",
      base_version_id: 77,
      parameters: { objects: [expect.objectContaining({ text: "After" })] },
    });
  });
  it("flushes internal link navigation and stays in the editor if saving fails", async () => {
    await open(
      record({
        editor_state: {
          layer_id: 4,
          background_url: "/background.pdf",
          objects: [
            {
              id: "note",
              type: "text",
              page_number: 1,
              x: 40,
              y: 50,
              width: 180,
              height: 48,
              text: "Before",
              font_size: 16,
            },
          ],
        },
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = "/home";
    anchor.textContent = "Workspace home";
    const navigate = vi.fn((event) => event.preventDefault());
    anchor.addEventListener("click", navigate);
    document.body.appendChild(anchor);
    try {
      fixture.failSave = true;
      fireEvent.change(screen.getByLabelText(/text content/i), {
        target: { value: "Keep this edit" },
      });
      fireEvent.click(anchor);
      await screen.findByRole("alert");
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/text content/i).value).toBe(
        "Keep this edit",
      );
      fixture.failSave = false;
      await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      fireEvent.click(anchor);
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    } finally {
      anchor.remove();
    }
  });
  it("applies a completed crop after its gesture has ended", async () => {
    await open();
    await group("Pages");
    await userEvent.click(screen.getByRole("button", { name: "Crop tool" }));
    const svg = svgBounds();
    fireEvent.pointerDown(svg, { pointerId: 4, clientX: 40, clientY: 60 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 320, clientY: 410 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 320, clientY: 410 });
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "crop",
          parameters: expect.objectContaining({
            x: 40,
            y: 60,
            width: 280,
            height: expect.closeTo(350, 5),
          }),
        }),
        undefined,
      ),
    );
  });
  it("reports pending redactions before downloading or switching documents", async () => {
    const current = record();
    const other = record({ id: 43, title: "Another document" });
    fixture.documents = [current, other];
    setup();
    await screen.findByRole("heading", { name: current.title });
    await group("Secure");
    await userEvent.click(screen.getByRole("button", { name: "Redact tool" }));
    const svg = svgBounds();
    fireEvent.pointerDown(svg, { pointerId: 8, clientX: 40, clientY: 60 });
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 220, clientY: 110 });
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 220, clientY: 110 });
    await screen.findByLabelText("Redaction style");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        "Finish or clear the pending crop or redaction first.",
      ),
    );
    notifications.error.mockClear();
    await userEvent.click(
      screen.getByRole("button", { name: /Another document.*pages/ }),
    );
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        "Finish or clear the pending crop or redaction first.",
      ),
    );
    expect(api.fetchPdfDocument).toHaveBeenCalledTimes(1);
    expect(api.createPdfDocumentOperation).not.toHaveBeenCalled();
  });
  it("keeps redactions pending until their dedicated confirmation", async () => {
    await open();
    await group("Secure");
    await userEvent.click(screen.getByRole("button", { name: "Redact tool" }));
    const svg = svgBounds();
    fireEvent.pointerDown(svg, { pointerId: 12, clientX: 40, clientY: 60 });
    fireEvent.pointerMove(window, {
      pointerId: 12,
      clientX: 220,
      clientY: 110,
    });
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 220, clientY: 110 });
    await userEvent.selectOptions(
      await screen.findByLabelText("Redaction style"),
      "replace",
    );
    await userEvent.type(
      screen.getByLabelText("Replacement text"),
      "Public value",
    );
    expect(api.createPdfDocumentOperation).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Review redactions" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Redact selected areas" }),
    );
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "redact",
          parameters: {
            confirmed: true,
            regions: [
              expect.objectContaining({
                redaction_mode: "replace",
                replacement_text: "Public value",
                width: 180,
                height: 50,
              }),
            ],
          },
        }),
        undefined,
      ),
    );
  });
  it("previews range splits and sends page groups", async () => {
    await open();
    await group("Pages");
    await userEvent.click(screen.getByText("Split PDF"));
    const part = screen.getByLabelText("Part 1 pages");
    await userEvent.clear(part);
    await userEvent.type(part, "1,3");
    expect(screen.getByText(/Creates 2 PDFs: 2 pages/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Create split documents" }),
    );
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "split_by_ranges",
          parameters: { page_groups: [[1, 3], [2]] },
        }),
        undefined,
      ),
    );
  });
  it("retains downloads for every split result after opening the first document", async () => {
    const source = record();
    await open(source);
    api.fetchPdfDocuments.mockImplementation(async ({ q } = {}) => ({
      data: {
        documents: q
          ? fixture.documents.filter((doc) => doc.title.includes(q))
          : fixture.documents,
        usage: {},
      },
    }));
    await userEvent.type(screen.getByLabelText("Search documents"), "Product");
    await waitFor(() =>
      expect(api.fetchPdfDocuments).toHaveBeenCalledWith({ q: "Product" }),
    );
    const parts = [
      record({
        id: 43,
        title: "Source part 1",
        download_url: "/api/pdf_documents/43/download",
      }),
      record({
        id: 44,
        title: "Source part 2",
        download_url: "/api/pdf_documents/44/download",
      }),
    ];
    api.createPdfDocumentOperation.mockImplementationOnce(async () => {
      fixture.documents = [source, ...parts];
      return {
        data: {
          id: 10,
          kind: "split_by_ranges",
          status: "completed",
          progress: 100,
          result: { document_ids: [43, 44] },
          document: source,
          artifacts: [],
        },
      };
    });
    await group("Pages");
    await userEvent.click(screen.getByText("Split PDF"));
    expect(
      screen.getByRole("list", { name: "Split file preview" }).textContent,
    ).toContain("brief-part-1.pdf");
    await userEvent.click(
      screen.getByRole("button", { name: "Create split documents" }),
    );
    await screen.findByRole("heading", { name: "Source part 1" });
    await waitFor(() =>
      expect(
        screen
          .getByRole("link", { name: /Source part 2.pdf/ })
          .getAttribute("href"),
      ).toBe("/api/pdf_documents/44/download"),
    );
  });
  it("keeps queued mutations read-only after reopening and retrieves completion", async () => {
    const doc = record();
    fixture.documents = [doc];
    api.fetchPdfDocumentOperations.mockResolvedValue({
      data: {
        operations: [
          {
            id: 12,
            kind: "compress",
            pdf_document_id: 42,
            status: "processing",
            progress: 20,
            result: {},
            artifacts: [],
          },
        ],
      },
    });
    api.fetchPdfDocumentOperation.mockResolvedValue({
      data: {
        id: 12,
        kind: "compress",
        pdf_document_id: 42,
        status: "completed",
        progress: 100,
        result: {},
        artifacts: [],
        document: doc,
      },
    });
    setup();
    await screen.findByRole("heading", { name: doc.title });
    expect(screen.getByRole("button", { name: "Text tool" }).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Text tool" }).disabled).toBe(
        false,
      ),
    );
    expect(api.createPdfDocumentOperation).not.toHaveBeenCalled();
  });
  it("adds an editable page-number rule and preserves selection", async () => {
    await open();
    await group("Pages");
    await userEvent.click(screen.getByRole("button", { name: "Page numbers" }));
    expect(screen.getByText("Page numbers properties")).toBeTruthy();
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "save_objects",
          parameters: {
            objects: [
              expect.objectContaining({
                type: "page_number",
                format: "page_of_total",
              }),
            ],
          },
        }),
        undefined,
      ),
    );
  });
  it("edits page-number scope and keeps invalid ranges out of saved state", async () => {
    await open();
    await group("Pages");
    await userEvent.click(screen.getByRole("button", { name: "Page numbers" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Page scope"),
      "custom",
    );
    const pages = screen.getByLabelText("Pages to number");
    await userEvent.clear(pages);
    await userEvent.type(pages, "2, 4");
    fireEvent.blur(pages);
    fireEvent.change(screen.getByLabelText("Margin (points)"), {
      target: { value: "36" },
    });
    await waitFor(() =>
      expect(api.createPdfDocumentOperation).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "save_objects",
          parameters: {
            objects: [
              expect.objectContaining({ page_numbers: [2, 4], margin: 36 }),
            ],
          },
        }),
        undefined,
      ),
    );
    await userEvent.clear(pages);
    await userEvent.type(pages, "8");
    fireEvent.blur(pages);
    expect(screen.getByRole("alert").textContent).toContain(
      "Choose pages between 1 and 4",
    );
    expect(
      api.createPdfDocumentOperation.mock.calls.at(-1)[0].parameters.objects[0]
        .page_numbers,
    ).toEqual([2, 4]);
  });
  it("searches document text using the real Find integration", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Find in document" }),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Find in PDF" }),
      "searchable phrase",
    );
    expect(await screen.findByText("1 of 4")).toBeTruthy();
  });
  it("keeps the selected document open when a library search has no results", async () => {
    await open();
    fixture.documents = [];
    await userEvent.type(screen.getByLabelText("Search documents"), "missing");
    expect(await screen.findByText(/No documents match/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Product brief" })).toBeTruthy();
  });
  it("navigates to the first result after changing the Find query", async () => {
    await open(
      record({
        editor_state: {
          layer_id: 4,
          background_url: "/background.pdf",
          objects: [
            {
              id: "note",
              type: "text",
              page_number: 1,
              x: 40,
              y: 50,
              width: 180,
              height: 48,
              text: "Unique addition",
              font_size: 16,
            },
          ],
        },
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Find in document" }),
    );
    const input = screen.getByRole("searchbox", { name: "Find in PDF" });
    await userEvent.type(input, "searchable phrase");
    await screen.findByText("1 of 4");
    await userEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByLabelText("Current page").value).toBe("2");
    await userEvent.clear(input);
    await userEvent.type(input, "Unique addition");
    await screen.findByText("1 of 1");
    expect(screen.getByLabelText("Current page").value).toBe("1");
  });

  it("keeps Find functional after undo on the same background", async () => {
    const doc = record({ can_undo: true });
    await open(doc);
    api.undoPdfDocument.mockResolvedValue({
      data: { ...doc, current_version_id: 76, can_undo: false, can_redo: true },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Undo last PDF change" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Redo PDF change" }).disabled,
      ).toBe(false),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Find in document" }),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Find in PDF" }),
      "searchable phrase",
    );
    expect(await screen.findByText("1 of 4")).toBeTruthy();
  });

  it("keeps the demo read-only", async () => {
    setup(true);
    expect(await screen.findByText(/Read-only sample/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Text tool" }).disabled).toBe(
      true,
    );
    expect(api.fetchPdfDocuments).not.toHaveBeenCalled();
  });
});

describe("page-range input", () => {
  it("handles mixed ranges and removes duplicate selections", () =>
    expect(parsePageRange("1-3, 2, 5", 8)).toEqual([1, 2, 3, 5]));
  it("rejects ambiguous, reversed and out-of-bounds ranges", () => {
    ["1-", "3-1", "0", "9", "1,,2"].forEach((input) =>
      expect(() => parsePageRange(input, 8)).toThrow(),
    );
  });
});
