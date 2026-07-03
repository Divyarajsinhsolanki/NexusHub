// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
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
    vi.clearAllMocks();
    global.ResizeObserver = ResizeObserverMock;
  });

  it("renders the persistent-library empty state", async () => {
    render(
      <AuthContext.Provider value={{ user: { id: 1, demo_account: false } }}>
        <PdfMaster />
      </AuthContext.Provider>
    );

    expect(await screen.findByText("Add your first PDF")).toBeTruthy();
    expect(screen.getByText("Documents stay in your personal library until you delete them.")).toBeTruthy();
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
});
