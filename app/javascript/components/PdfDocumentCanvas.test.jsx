// @vitest-environment jsdom
import React, { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pdfMock = vi.hoisted(() => ({
  ready: true,
  loaded: true,
  width: 612,
  height: 792,
  userUnit: 1,
  callbacks: [],
}));
vi.mock("react-pdf", () => ({
  Document: ({ children, onLoadError, onLoadSuccess, file }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ numPages: 3, getPage: vi.fn() });
    }, [file]);
    return (
      <div data-pdf-file={file}>
        {children}
        <button onClick={() => onLoadError?.(new Error("Failed to fetch"))}>
          Simulate PDF failure
        </button>
      </div>
    );
  },
  Page: ({
    pageNumber,
    width,
    onLoadSuccess,
    onRenderSuccess,
    onLoadError,
    onRenderError,
    customTextRenderer,
    renderTextLayer,
  }) => {
    React.useEffect(() => {
      pdfMock.callbacks.push({
        onLoadSuccess,
        onRenderSuccess,
        onLoadError,
        onRenderError,
      });
      if (pdfMock.loaded)
        onLoadSuccess?.({
          userUnit: pdfMock.userUnit,
          getViewport: ({ scale }) => ({
            width: pdfMock.width * scale * pdfMock.userUnit,
            height: pdfMock.height * scale * pdfMock.userUnit,
          }),
        });
      if (pdfMock.ready) onRenderSuccess?.();
    }, [pageNumber, width]);
    return (
      <div>
        PDF page
        {renderTextLayer ? (
          <span
            data-testid="find-text"
            dangerouslySetInnerHTML={{
              __html: customTextRenderer({
                str: "Find phrase and phrase",
                itemIndex: 0,
              }),
            }}
          />
        ) : null}
      </div>
    );
  },
  pdfjs: { GlobalWorkerOptions: {} },
}));

import PdfDocumentCanvas from "./PdfDocumentCanvas";

class ResizeObserverMock {
  constructor(callback) {
    this.callback = callback;
    ResizeObserverMock.last = this;
  }
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
  record = documentRecord,
  pageNumber = 1,
  placementAsset,
  ...canvasProps
}) => {
  const [shapes, setShapeState] = useState(initialShapes);
  const [selectedShapeId, setSelectedShapeId] = useState(
    initialSelectedShapeId,
  );
  const setShapes = (updater) =>
    setShapeState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return placementAsset
        ? next.map((shape) =>
            shape.type === "image" && !shape.asset_id
              ? { ...shape, ...placementAsset }
              : shape,
          )
        : next;
    });

  return (
    <>
      <PdfDocumentCanvas
        documentRecord={record}
        pageNumber={pageNumber}
        zoom={1}
        activeTool={activeTool}
        shapes={shapes}
        setShapes={setShapes}
        selectedShapeId={selectedShapeId}
        setSelectedShapeId={setSelectedShapeId}
        {...canvasProps}
      />
      <output data-testid="shapes">{JSON.stringify(shapes)}</output>
    </>
  );
};

const currentShape = () =>
  JSON.parse(screen.getByTestId("shapes").textContent)[0];
const currentShapes = () =>
  JSON.parse(screen.getByTestId("shapes").textContent);

const setSvgBounds = (width = 612, height = 792) => {
  const svg = document.querySelector("svg");
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
  });
  return svg;
};

describe("PdfDocumentCanvas", () => {
  it("can retry a failed preview and recover when another document is selected", async () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(screen.getByText("Simulate PDF failure"));
    expect(screen.getByText("Failed to fetch")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry preview"));
    expect(screen.getByText("PDF page")).toBeTruthy();
    fireEvent.click(screen.getByText("Simulate PDF failure"));
    rerender(
      <Harness
        record={{ ...documentRecord, id: 43, content_url: "/another.pdf" }}
      />,
    );
    await waitFor(() => expect(screen.getByText("PDF page")).toBeTruthy());
  });
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pdfMock.ready = true;
    pdfMock.loaded = true;
    pdfMock.width = 612;
    pdfMock.height = 792;
    pdfMock.userUnit = 1;
    pdfMock.callbacks = [];
    global.ResizeObserver = ResizeObserverMock;
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => true);
  });

  it("continues dragging text shapes from window pointer movement", async () => {
    render(<Harness />);

    setSvgBounds();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /move text box/i }),
      { pointerId: 4, clientX: 104, clientY: 118 },
    );
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

    fireEvent.pointerDown(moveHandle, {
      pointerId: 5,
      clientX: 150,
      clientY: 130,
    });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 210, clientY: 170 });
    fireEvent.pointerUp(window, { pointerId: 5, clientX: 210, clientY: 170 });

    await waitFor(() => {
      expect(currentShapes()).toHaveLength(1);
      expect(currentShape()).toMatchObject({ x: 160, y: 140 });
    });
  });

  it("syncs inline text edits into the staged shape", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByDisplayValue("Text"), {
      target: { value: "Typed on PDF" },
    });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({ text: "Typed on PDF" });
    });
  });

  it("creates a smaller default text box", async () => {
    render(
      <Harness
        activeTool="text"
        initialShapes={[]}
        initialSelectedShapeId={null}
      />,
    );

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
    render(
      <Harness
        activeTool="rectangle"
        initialShapes={[]}
        initialSelectedShapeId={null}
      />,
    );

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

  it("creates secure black redactions by default", async () => {
    render(
      <Harness
        activeTool="redact"
        initialShapes={[]}
        initialSelectedShapeId={null}
      />,
    );

    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 9, clientX: 80, clientY: 90 });
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 240, clientY: 140 });
    fireEvent.pointerUp(window, { pointerId: 9, clientX: 240, clientY: 140 });

    await waitFor(() => {
      expect(currentShape()).toMatchObject({
        type: "redact",
        redaction_mode: "black",
        replacement_text: "",
        replacement_color: "#111827",
        width: 160,
        height: 50,
      });
    });
  });

  it("previews replacement text and strikethrough styles", () => {
    const replacement = {
      id: "redact-replace",
      type: "redact",
      page_number: 1,
      x: 50,
      y: 80,
      width: 180,
      height: 40,
      redaction_mode: "replace",
      replacement_text: "Approved",
      replacement_color: "#111827",
      font_size: 14,
    };
    const strike = {
      ...replacement,
      id: "redact-strike",
      y: 150,
      redaction_mode: "strike",
      replacement_color: "#dc2626",
      stroke_width: 4,
    };

    render(
      <Harness
        initialShapes={[replacement, strike]}
        initialSelectedShapeId="redact-replace"
      />,
    );

    expect(screen.getByText("Approved")).toBeTruthy();
    const line = document.querySelector("svg line");
    expect(line?.getAttribute("stroke")).toBe("#dc2626");
    expect(line?.getAttribute("stroke-width")).toBe("4");
  });

  it("waits for page rendering before allowing placement and text edits", () => {
    pdfMock.ready = false;
    render(<Harness activeTool="text" />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.change(screen.getByDisplayValue("Text"), {
      target: { value: "Too early" },
    });
    expect(currentShapes()).toEqual([initialTextShape]);
    expect(screen.getByLabelText("text content").readOnly).toBe(true);
  });

  it("requires this page's viewport and ignores stale rendering callbacks", () => {
    pdfMock.ready = false;
    const { rerender } = render(<Harness activeTool="text" />);
    const oldCallbacks = pdfMock.callbacks.at(-1);
    pdfMock.width = 300;
    pdfMock.height = 400;
    rerender(<Harness activeTool="text" pageNumber={2} />);
    const currentCallbacks = pdfMock.callbacks.at(-1);
    act(() => {
      oldCallbacks.onRenderSuccess();
      oldCallbacks.onLoadError(new Error("Old page failed"));
    });
    expect(screen.queryByText("Old page failed")).toBeNull();
    const svg = setSvgBounds(300, 400);
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    expect(currentShapes()).toEqual([initialTextShape]);
    act(() => currentCallbacks.onRenderSuccess());
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    expect(currentShapes()[1]).toMatchObject({
      type: "text",
      page_number: 2,
      x: 10,
      y: 20,
    });
  });

  it("waits for page geometry even if a render callback arrives first", () => {
    pdfMock.ready = false;
    pdfMock.loaded = false;
    render(<Harness activeTool="text" />);
    const callbacks = pdfMock.callbacks.at(-1);
    act(() => callbacks.onRenderSuccess());
    expect(screen.getByLabelText("text content").readOnly).toBe(true);
    act(() =>
      callbacks.onLoadSuccess({
        userUnit: 1,
        getViewport: () => ({ width: 612, height: 792 }),
      }),
    );
    expect(screen.getByLabelText("text content").readOnly).toBe(true);
    act(() => callbacks.onRenderSuccess());
    expect(screen.getByLabelText("text content").readOnly).toBe(false);
  });

  it("uses raw PDF units for placement on a UserUnit-scaled page", () => {
    pdfMock.userUnit = 2;
    pdfMock.width = 300;
    pdfMock.height = 400;
    const onPageLoaded = vi.fn();
    render(
      <Harness
        activeTool="text"
        initialShapes={[]}
        onPageLoaded={onPageLoaded}
      />,
    );
    expect(onPageLoaded).toHaveBeenLastCalledWith({ width: 300, height: 400 });
    const svg = setSvgBounds(300, 400);
    expect(svg.getAttribute("viewBox")).toBe("0 0 300 400");
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 120 });
    expect(currentShape()).toMatchObject({
      x: 100,
      y: 120,
      width: 160,
      height: 48,
    });
  });

  it("guards all editing when editable is false", () => {
    render(<Harness activeTool="rectangle" editable={false} />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.change(screen.getByDisplayValue("Text"), {
      target: { value: "Disabled edit" },
    });
    expect(currentShapes()).toEqual([initialTextShape]);
    expect(screen.queryByRole("button", { name: /move text box/i })).toBeNull();
  });

  it("requests one save after a completed gesture, with its final geometry", async () => {
    const onGestureEnd = vi.fn();
    render(
      <Harness
        activeTool="rectangle"
        initialShapes={[]}
        onGestureEnd={onGestureEnd}
      />,
    );
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 70 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 120 });
    expect(onGestureEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 120 });
    await waitFor(() => expect(onGestureEnd).toHaveBeenCalledTimes(1));
    expect(onGestureEnd.mock.calls[0][0][0]).toMatchObject({
      x: 10,
      y: 20,
      width: 90,
      height: 100,
    });
  });

  it("captures pointer-up movement even when no move event was dispatched", async () => {
    const onGestureEnd = vi.fn();
    render(
      <Harness
        activeTool="rectangle"
        initialShapes={[]}
        onGestureEnd={onGestureEnd}
      />,
    );
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 20, clientY: 40 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120, clientY: 100 });
    expect(currentShape()).toMatchObject({
      x: 20,
      y: 40,
      width: 100,
      height: 60,
    });
    await waitFor(() => expect(onGestureEnd).toHaveBeenCalledTimes(1));
  });

  it("discards click-only drawing without saving an invalid object", async () => {
    const onGestureEnd = vi.fn();
    const onGestureStart = vi.fn();
    const onGestureCancel = vi.fn();
    render(
      <Harness
        activeTool="pen"
        initialShapes={[]}
        onGestureEnd={onGestureEnd}
        onGestureStart={onGestureStart}
        onGestureCancel={onGestureCancel}
      />,
    );
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 20 });
    expect(currentShapes()).toEqual([]);
    await act(async () => {});
    expect(onGestureEnd).not.toHaveBeenCalled();
    expect(onGestureStart).toHaveBeenCalledTimes(1);
    expect(onGestureCancel).toHaveBeenCalledWith([]);
  });

  it("ignores other pointers ending while a gesture is active", () => {
    render(<Harness activeTool="rectangle" initialShapes={[]} />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 120 });
    expect(currentShape()).toMatchObject({ width: 90, height: 100 });
  });

  it("ignores another pointer's cancellation during a drawing gesture", () => {
    render(<Harness activeTool="rectangle" initialShapes={[]} />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerCancel(window, { pointerId: 2 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 120 });
    expect(currentShape()).toMatchObject({ width: 90, height: 100 });
  });

  it("restores the original object after a cancelled drag", () => {
    render(<Harness />);
    setSvgBounds();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /move text box/i }),
      { pointerId: 1, clientX: 100, clientY: 100 },
    );
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(currentShape()).toEqual(initialTextShape);
  });

  it("cancels a Select-mode drag with Escape and restores its original geometry", async () => {
    const onGestureCancel = vi.fn();
    const onGestureEnd = vi.fn();
    render(
      <Harness onGestureCancel={onGestureCancel} onGestureEnd={onGestureEnd} />,
    );
    setSvgBounds();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /move text box/i }),
      { pointerId: 1, clientX: 100, clientY: 100 },
    );
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(currentShape()).toEqual(initialTextShape);
    await waitFor(() =>
      expect(onGestureCancel).toHaveBeenCalledWith([initialTextShape]),
    );
    expect(onGestureEnd).not.toHaveBeenCalled();
  });

  it("bounds text placement at the bottom-right page edge", () => {
    render(<Harness activeTool="text" initialShapes={[]} />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 610, clientY: 790 });
    expect(currentShape()).toMatchObject({
      x: 452,
      y: 744,
      width: 160,
      height: 48,
    });
  });

  it("previews real images and resizes them proportionally", () => {
    const image = {
      id: "image-1",
      type: "image",
      page_number: 1,
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      aspect_ratio: 2,
      asset_url: "/signature.png",
    };
    render(
      <Harness initialShapes={[image]} initialSelectedShapeId="image-1" />,
    );
    setSvgBounds();
    expect(document.querySelector("svg image").getAttribute("href")).toBe(
      "/signature.png",
    );
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Resize image from se" }),
      { pointerId: 1, clientX: 200, clientY: 150 },
    );
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 320, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 320, clientY: 200 });
    expect(currentShape()).toMatchObject({
      width: 220,
      height: 110,
      asset_url: "/signature.png",
    });
  });

  it("places an image proportionally from its uploaded asset dimensions", () => {
    render(
      <Harness
        activeTool="image"
        initialShapes={[]}
        placementAsset={{
          asset_id: "asset-1",
          asset_url: "/image.png",
          aspect_ratio: 2,
        }}
      />,
    );
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 180 });
    expect(currentShape()).toMatchObject({
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      asset_id: "asset-1",
      aspect_ratio: 2,
    });
    expect(document.querySelector("svg image").getAttribute("href")).toBe(
      "/image.png",
    );
  });

  it("matches exported text spacing and disables kerning and ligatures", () => {
    render(<Harness />);
    const textarea = screen.getByLabelText("text content");
    const scale = 800 / 612;
    expect(parseFloat(textarea.style.lineHeight)).toBeCloseTo(
      (18 * 1.199 + 18 * 0.15) * scale,
    );
    expect(textarea.style.fontKerning).toBe("none");
    expect(textarea.style.fontVariantLigatures).toBe("none");
    expect(textarea.style.transform.startsWith("translateY(-")).toBe(true);
  });

  it("renders highlights without an export-inconsistent border", () => {
    render(
      <Harness
        initialShapes={[
          {
            id: "h1",
            type: "highlight",
            page_number: 1,
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            opacity: 0.35,
          },
        ]}
        initialSelectedShapeId={null}
      />,
    );
    const rect = document.querySelector(
      'g[aria-label="highlight object"] rect',
    );
    expect(rect.getAttribute("stroke")).toBe("none");
    expect(rect.getAttribute("opacity")).toBe("0.35");
  });

  it("draws a strikethrough annotation without a redaction fill", () => {
    render(<Harness activeTool="strike" initialShapes={[]} />);
    const svg = setSvgBounds();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 50 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120, clientY: 50 });
    expect(currentShape()).toMatchObject({
      type: "strike",
      width: 100,
      height: 20,
    });
    const group = document.querySelector('g[aria-label="strike object"]');
    expect(group.querySelector("rect").getAttribute("fill")).toBe(
      "transparent",
    );
    expect(group.querySelector("line").getAttribute("y1")).toBe("40");
  });

  it("offers keyboard resizing without moving the object twice", () => {
    render(<Harness />);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(
      screen.getByRole("button", { name: "Resize text from se" }),
      event,
    );
    expect(event.defaultPrevented).toBe(true);
    expect(currentShape()).toMatchObject({
      x: 100,
      y: 100,
      width: 250,
      height: 90,
    });
  });

  it("does not start keyboard resizing during an active pointer gesture", () => {
    render(<Harness />);
    setSvgBounds();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /move text box/i }),
      { pointerId: 1, clientX: 100, clientY: 100 },
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Resize text from se" }),
      { key: "ArrowRight", shiftKey: true },
    );
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 140, clientY: 150 });
    expect(currentShape()).toMatchObject({
      x: 140,
      y: 150,
      width: 240,
      height: 90,
    });
  });

  it("allows native pan in Select and switches touch handling for drawing", () => {
    const { rerender } = render(<Harness activeTool="select" />);
    expect(screen.getByTestId("pdf-edit-layer").style.touchAction).toBe("auto");
    rerender(<Harness activeTool="pen" />);
    expect(screen.getByTestId("pdf-edit-layer").style.touchAction).toBe("none");
  });

  it("fits the whole page to available height and retains true width at higher zoom", () => {
    const { rerender } = render(<Harness zoomMode="fit-page" />);
    act(() =>
      ResizeObserverMock.last.callback([
        { contentRect: { width: 1000, height: 600 } },
      ]),
    );
    const page = document.querySelector(".nexus-pdf-page");
    expect(parseFloat(page.style.height)).toBeCloseTo(600);
    expect(parseFloat(page.style.width)).toBeCloseTo((600 * 612) / 792);
    rerender(<Harness zoom={2} zoomMode="custom" />);
    expect(parseFloat(page.style.width)).toBe(2000);
    expect(page.classList.contains("shrink-0")).toBe(true);
  });

  it("marks each match independently without editing the document", () => {
    const matches = [
      {
        id: "first",
        pageNumber: 1,
        itemSlices: { 0: [{ start: 5, end: 11 }] },
      },
      {
        id: "second",
        pageNumber: 1,
        itemSlices: { 0: [{ start: 16, end: 22 }] },
      },
    ];
    render(<Harness findOpen findMatches={matches} findMatch={matches[1]} />);
    const marks = screen.getByTestId("find-text").querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0].classList.contains("active")).toBe(false);
    expect(marks[1].classList.contains("active")).toBe(true);
    expect(currentShapes()).toEqual([initialTextShape]);
  });

  it("previews a page-number rule on its target pages", () => {
    render(
      <Harness
        record={{ ...documentRecord, page_count: 3 }}
        pageNumber={2}
        initialShapes={[
          {
            id: "numbers",
            type: "page_number",
            page_numbers: [2],
            start_number: 5,
            format: "page_of_total",
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Page number: Page 6 of 3")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /resize page_number/i }),
    ).toBeNull();
  });

  it("matches page-number output position, padding and zero-valued settings", () => {
    render(
      <Harness
        record={{ ...documentRecord, page_count: 3 }}
        initialShapes={[
          {
            id: "numbers",
            type: "page_number",
            start_number: 0,
            margin: 0,
            position: "bottom-right",
            format: "page_of_total",
            font_size: 12,
          },
        ]}
      />,
    );
    const preview = screen.getByTestId("pdf-text-shape-numbers");
    const textarea = screen.getByLabelText("Page number: Page 0 of 3");
    const scale = 800 / 612;
    expect(parseFloat(preview.style.left)).toBeCloseTo((612 - 200) * scale);
    expect(parseFloat(preview.style.top)).toBeCloseTo((792 - 12 * 1.8) * scale);
    expect(parseFloat(preview.style.height)).toBeCloseTo(12 * 1.8 * scale);
    expect(textarea.style.textAlign).toBe("right");
    expect(textarea.style.fontWeight).toBe("400");
    expect(parseFloat(textarea.style.padding)).toBeCloseTo(4 * scale);
    expect(textarea.readOnly).toBe(true);
  });

  it("highlights the active page-number match on its matching page", () => {
    const props = {
      record: { ...documentRecord, page_count: 3 },
      initialShapes: [{ id: "numbers", type: "page_number", start_number: 1 }],
      findOpen: true,
      findMatch: {
        id: "object-numbers-page-2-0",
        objectId: "numbers",
        pageNumber: 2,
      },
    };
    const { rerender } = render(<Harness {...props} pageNumber={1} />);
    expect(
      screen
        .getByTestId("pdf-text-shape-numbers")
        .classList.contains("ring-amber-500"),
    ).toBe(false);
    rerender(<Harness {...props} pageNumber={2} />);
    expect(
      screen
        .getByTestId("pdf-text-shape-numbers")
        .classList.contains("ring-amber-500"),
    ).toBe(true);
  });
});
