// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  Document: ({ children }) => <div>{children}</div>,
  Page: () => <div>PDF page</div>,
  pdfjs: { GlobalWorkerOptions: {} },
}));

import PdfDocumentCanvas from "./PdfDocumentCanvas";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const documentRecord = {
  id: 42,
  current_version_id: 7,
  content_url: "/pdf.pdf",
};

const initialTextShape = {
  id: "text-1",
  type: "text",
  page_number: 1,
  x: 100,
  y: 100,
  width: 240,
  height: 90,
  text: "Text",
  font_size: 18,
  color: "#111827",
};

const Harness = ({
  activeTool = "select",
  initialShapes = [initialTextShape],
  initialSelectedShapeId = "text-1",
}) => {
  const [shapes, setShapes] = useState(initialShapes);
  const [selectedShapeId, setSelectedShapeId] = useState(initialSelectedShapeId);

  return (
    <>
      <PdfDocumentCanvas
        documentRecord={documentRecord}
        pageNumber={1}
        zoom={1}
        activeTool={activeTool}
        shapes={shapes}
        setShapes={setShapes}
        selectedShapeId={selectedShapeId}
        setSelectedShapeId={setSelectedShapeId}
      />
      <output data-testid="shapes">{JSON.stringify(shapes)}</output>
    </>
  );
};

const currentShape = () => JSON.parse(screen.getByTestId("shapes").textContent)[0];
const currentShapes = () => JSON.parse(screen.getByTestId("shapes").textContent);

const setSvgBounds = () => {
  const svg = document.querySelector("svg");
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 612,
    height: 792,
    right: 612,
    bottom: 792,
  });
  return svg;
};

describe("PdfDocumentCanvas", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.ResizeObserver = ResizeObserverMock;
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
  });

  it("continues dragging text shapes from window pointer movement", async () => {
    render(<Harness />);

    setSvgBounds();

    fireEvent.pointerDown(screen.getByRole("button", { name: /move text box/i }), { pointerId: 4, clientX: 104, clientY: 118 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 184, clientY: 158 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 184, clientY: 158 });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({ x: 180, y: 140 });
    });
  });

  it("drags selected text with the move handle while the text tool is active", async () => {
    render(<Harness activeTool="text" />);

    setSvgBounds();
    const moveHandle = screen.getByRole("button", { name: /move text box/i });

    fireEvent.pointerDown(moveHandle, { pointerId: 5, clientX: 150, clientY: 130 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 210, clientY: 170 });
    fireEvent.pointerUp(window, { pointerId: 5, clientX: 210, clientY: 170 });

    await waitFor(() => {
      expect(currentShapes()).toHaveLength(1);
      expect(currentShape()).toMatchObject({ x: 160, y: 140 });
    });
  });

  it("syncs inline text edits into the staged shape", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByDisplayValue("Text"), { target: { value: "Typed on PDF" } });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({ text: "Typed on PDF" });
    });
  });

  it("creates a smaller default text box", async () => {
    render(<Harness activeTool="text" initialShapes={[]} initialSelectedShapeId={null} />);

    const svg = setSvgBounds();

    fireEvent.pointerDown(svg, { pointerId: 6, clientX: 100, clientY: 110 });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({
        type: "text",
        x: 100,
        y: 110,
        width: 160,
        height: 48,
        font_size: 16,
      });
    });
  });

  it("draws new shapes from window pointer movement", async () => {
    render(<Harness activeTool="rectangle" initialShapes={[]} initialSelectedShapeId={null} />);

    const svg = setSvgBounds();

    fireEvent.pointerDown(svg, { pointerId: 8, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 140, clientY: 150 });
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 140, clientY: 150 });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({
        type: "rectangle",
        x: 80,
        y: 90,
        width: 60,
        height: 60,
      });
    });
  });
});
