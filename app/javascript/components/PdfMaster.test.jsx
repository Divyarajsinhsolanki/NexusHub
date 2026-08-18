// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  Document: ({ children }) => <div>{children}</div>,
  Page: () => <div>PDF page</div>,
  pdfjs: { GlobalWorkerOptions: {} },
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }) => <div>{children}</div>,
  Droppable: ({ children }) => children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
  Draggable: ({ children }) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, {}),
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
  fetchPdfDocuments: vi.fn(() => Promise.resolve({
    data: {
      documents: [],
      usage: {
        document_count: 0,
        document_limit: 25,
        storage_bytes: 0,
        storage_limit_bytes: 1073741824,
      },
    },
  })),
  createPdfDocumentOperation: vi.fn(),
  deletePdfDocument: vi.fn(),
  fetchPdfDocumentOperation: vi.fn(),
  redoPdfDocument: vi.fn(),
  renamePdfDocument: vi.fn(),
  restorePdfDocument: vi.fn(),
  undoPdfDocument: vi.fn(),
  uploadPdfDocument: vi.fn(),
}));

vi.mock("../context/AuthContext", async () => {
  const ReactModule = await import("react");
  return { AuthContext: ReactModule.createContext({ user: null }) };
});

import { AuthContext } from "../context/AuthContext";
import * as pdfApi from "./api";
import PdfMaster from "./PdfMaster";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("PdfMaster", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.values(pdfApi).forEach((mock) => mock.mockReset?.());
    global.ResizeObserver = ResizeObserverMock;
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [],
        usage: {
          document_count: 0,
          document_limit: 25,
          storage_bytes: 0,
          storage_limit_bytes: 1073741824,
        },
      },
    });
  });

  it("renders the persistent-library empty state", async () => {
    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    expect(await screen.findByText("Add your first PDF")).toBeTruthy();
    expect(screen.getByText("Documents stay in your personal library until you delete them.")).toBeTruthy();
    expect(pdfApi.fetchPdfDocuments).toHaveBeenCalledTimes(1);
  });

  it("shows a retry state when the document library cannot load", async () => {
    const user = userEvent.setup();
    pdfApi.fetchPdfDocuments
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({ data: { documents: [], usage: { document_count: 0, document_limit: 25, storage_bytes: 0, storage_limit_bytes: 1073741824 } } });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    expect((await screen.findByRole("alert")).textContent).toContain("Network unavailable");
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Add your first PDF")).toBeTruthy();
    expect(pdfApi.fetchPdfDocuments).toHaveBeenCalledTimes(2);
  });

  it("opens the mobile tools panel without changing the selected document", async () => {
    const user = userEvent.setup();
    const document = {
      id: 42,
      title: "Ops Playbook",
      original_filename: "ops-playbook.pdf",
      page_count: 1,
      encrypted: false,
      current_version_id: 77,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/42/content",
      download_url: "/api/pdf_documents/42/download",
      byte_size: 1200,
    };
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [document],
        usage: { document_count: 1, document_limit: 25, storage_bytes: 1200, storage_limit_bytes: 1073741824 },
      },
    });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    expect((await screen.findAllByText("Ops Playbook")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^tools$/i }));

    expect(screen.getByRole("heading", { name: /^tools$/i })).toBeTruthy();
    expect(screen.getAllByText("Ops Playbook").length).toBeGreaterThan(0);
  });

  it("sends the selected document version when running an operation", async () => {
    const user = userEvent.setup();
    const document = {
      id: 42,
      title: "Ops Playbook",
      original_filename: "ops-playbook.pdf",
      page_count: 1,
      encrypted: false,
      current_version_id: 77,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/42/content",
      download_url: "/api/pdf_documents/42/download",
      byte_size: 1200,
    };
    pdfApi.fetchPdfDocuments
      .mockResolvedValueOnce({
        data: {
          documents: [document],
          usage: { document_count: 1, document_limit: 25, storage_bytes: 1200, storage_limit_bytes: 1073741824 },
        },
      })
      .mockResolvedValue({
        data: {
          documents: [document],
          usage: { document_count: 1, document_limit: 25, storage_bytes: 1200, storage_limit_bytes: 1073741824 },
        },
      });
    pdfApi.createPdfDocumentOperation.mockResolvedValueOnce({
      data: {
        id: 9,
        kind: "compress",
        status: "completed",
        progress: 100,
        result: { document_id: 42 },
        artifacts: [],
        document,
      },
    });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    await user.click(await screen.findByRole("button", { name: /compress/i }));

    expect(pdfApi.createPdfDocumentOperation).toHaveBeenCalledWith({
      kind: "compress",
      pdf_document_id: 42,
      base_version_id: 77,
      parameters: {},
    }, undefined);
  });

  it("provides unlock controls in the responsive tools dialog and closes it with Escape", async () => {
    const user = userEvent.setup();
    const encryptedDocument = {
      id: 51,
      title: "Protected plan",
      original_filename: "protected.pdf",
      page_count: 0,
      encrypted: true,
      current_version_id: 91,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/51/content",
      download_url: "/api/pdf_documents/51/download",
      byte_size: 2400,
    };
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [encryptedDocument],
        usage: { document_count: 1, document_limit: 500, storage_bytes: 2400, storage_limit_bytes: 25 * 1024 ** 3 },
      },
    });
    pdfApi.createPdfDocumentOperation.mockResolvedValue({
      data: { id: 12, kind: "unlock", status: "completed", progress: 100, result: { document_id: 51 }, artifacts: [], document: encryptedDocument },
    });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    await screen.findAllByText("Protected plan");
    const toolsButton = screen.getByRole("button", { name: /^tools$/i });
    await user.click(toolsButton);
    expect(screen.getByRole("dialog", { name: /^tools$/i }).textContent).toContain("Password-protected PDF");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^tools$/i })).toBeNull());
    expect(document.activeElement).toBe(toolsButton);
  });

  it("configures replacement redactions and sends the selected style", async () => {
    const user = userEvent.setup();
    const documentRecord = {
      id: 42,
      title: "Sensitive report",
      original_filename: "sensitive.pdf",
      page_count: 1,
      encrypted: false,
      current_version_id: 77,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/42/content",
      download_url: "/api/pdf_documents/42/download",
      byte_size: 1200,
    };
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [documentRecord],
        usage: { document_count: 1, document_limit: 25, storage_bytes: 1200, storage_limit_bytes: 1073741824 },
      },
    });
    pdfApi.createPdfDocumentOperation.mockResolvedValue({
      data: {
        id: 15,
        kind: "redact",
        status: "completed",
        progress: 100,
        result: { document_id: 42 },
        artifacts: [],
        document: documentRecord,
      },
    });
    window.confirm = vi.fn(() => true);

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    await screen.findAllByText("Sensitive report");
    await user.click(screen.getByRole("button", { name: "Redact tool" }));
    const svg = document.querySelector(".nexus-pdf-page svg");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792, right: 612, bottom: 792 });
    fireEvent.pointerDown(svg, { pointerId: 12, clientX: 40, clientY: 60 });
    fireEvent.pointerMove(window, { pointerId: 12, clientX: 220, clientY: 110 });
    fireEvent.pointerUp(window, { pointerId: 12, clientX: 220, clientY: 110 });

    const styleSelect = await screen.findByLabelText("Redaction style");
    await user.selectOptions(styleSelect, "replace");
    await user.type(screen.getByLabelText("Replacement text"), "Public value");
    await user.click(screen.getByRole("button", { name: /apply changes/i }));

    await waitFor(() => expect(pdfApi.createPdfDocumentOperation).toHaveBeenCalledWith({
      kind: "redact",
      pdf_document_id: 42,
      base_version_id: 77,
      parameters: {
        regions: [expect.objectContaining({
          redaction_mode: "replace",
          replacement_text: "Public value",
          replacement_color: "#111827",
          x: 40,
          y: 60,
          width: 180,
          height: 50,
        })],
      },
    }, undefined));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps advanced desktop tools collapsed until requested", async () => {
    const user = userEvent.setup();
    const documentRecord = {
      id: 61,
      title: "Product brief",
      original_filename: "product-brief.pdf",
      page_count: 4,
      encrypted: false,
      current_version_id: 101,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/61/content",
      download_url: "/api/pdf_documents/61/download",
      byte_size: 2400,
    };
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [documentRecord],
        usage: { document_count: 1, document_limit: 25, storage_bytes: 2400, storage_limit_bytes: 1073741824 },
      },
    });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    await screen.findAllByText("Product brief");
    const securityDetails = screen.getByText("Security").closest("details");
    const mergeDetails = screen.getByText("Merge PDFs").closest("details");
    const splitDetails = screen.getByText("Split PDF").closest("details");

    expect(securityDetails.open).toBe(false);
    expect(mergeDetails.open).toBe(false);
    expect(splitDetails.open).toBe(false);
    expect(screen.getByRole("button", { name: /compress/i })).toBeTruthy();

    await user.click(securityDetails.querySelector("summary"));
    expect(securityDetails.open).toBe(true);
    expect(mergeDetails.open).toBe(false);
    expect(splitDetails.open).toBe(false);
  });

  it("uses the same compact expandable tools in the mobile dialog", async () => {
    const user = userEvent.setup();
    const documentRecord = {
      id: 62,
      title: "Mobile brief",
      original_filename: "mobile-brief.pdf",
      page_count: 2,
      encrypted: false,
      current_version_id: 102,
      can_undo: false,
      can_redo: false,
      content_url: "/api/pdf_documents/62/content",
      download_url: "/api/pdf_documents/62/download",
      byte_size: 1800,
    };
    pdfApi.fetchPdfDocuments.mockResolvedValue({
      data: {
        documents: [documentRecord],
        usage: { document_count: 1, document_limit: 25, storage_bytes: 1800, storage_limit_bytes: 1073741824 },
      },
    });

    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    await screen.findAllByText("Mobile brief");
    await user.click(screen.getByRole("button", { name: /^tools$/i }));
    const dialog = screen.getByRole("dialog", { name: /^tools$/i });
    const mobileSecurity = within(dialog).getByText("Security").closest("details");
    const mobileMerge = within(dialog).getByText("Merge PDFs").closest("details");
    const mobileSplit = within(dialog).getByText("Split PDF").closest("details");

    expect(mobileSecurity.open).toBe(false);
    expect(mobileMerge.open).toBe(false);
    expect(mobileSplit.open).toBe(false);
    expect(within(dialog).getByRole("button", { name: /compress/i })).toBeTruthy();

    await user.click(mobileSplit.querySelector("summary"));
    expect(mobileSplit.open).toBe(true);
  });
});
