import { describe, expect, it } from "vitest";
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
} from "./pdfCoordinates";

describe("PDF coordinate helpers", () => {
  it("maps screen positions into unscaled page coordinates", () => {
    expect(
      screenPointToPdf({
        clientX: 150,
        clientY: 250,
        bounds: { left: 50, top: 50, width: 400, height: 800 },
        pageWidth: 200,
        pageHeight: 400,
      }),
    ).toEqual({ x: 50, y: 100 });
  });

  it("normalizes rectangles drawn in any direction", () => {
    expect(normalizedRectangle({ x: 80, y: 60 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 50,
    });
  });

  it("normalizes UserUnit without losing rotated CropBox viewport geometry", () => {
    const getViewport = ({ scale }) => ({
      width: 300 * scale * 2,
      height: 400 * scale * 2,
      transform: [0, scale * 2, scale * 2, 0, -25 * scale * 2, -10 * scale * 2],
    });
    const viewport = editorPageViewport({ userUnit: 2, getViewport });
    expect(viewport).toEqual({
      width: 300,
      height: 400,
      transform: [0, 1, 1, 0, -25, -10],
    });
    expect(
      screenPointToPdf({
        clientX: 250,
        clientY: 350,
        bounds: { left: 50, top: 50, width: 600, height: 800 },
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      }),
    ).toEqual({ x: 100, y: 150 });
  });

  it("draws proportional image boxes in either direction without crossing page bounds", () => {
    expect(
      proportionalRectangle({ x: 10, y: 20 }, { x: 90, y: 90 }, 2, 100, 100),
    ).toEqual({ x: 10, y: 20, width: 90, height: 45 });
    expect(
      proportionalRectangle({ x: 90, y: 80 }, { x: 60, y: 20 }, 2, 100, 100),
    ).toEqual({ x: 0, y: 35, width: 90, height: 45 });
    expect(
      proportionalRectangle({ x: 10, y: 20 }, { x: 10, y: 20 }, 2, 100, 100),
    ).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });

  it("retains endpoints of long pen strokes within the server point limit", () => {
    let points = [{ x: 0, y: 0 }];
    for (let x = 1; x <= 6000; x += 1)
      points = appendPdfPenPoint(points, { x, y: Math.sin(x) });
    expect(points.length).toBeLessThanOrEqual(2000);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 6000, y: Math.sin(6000) });
  });

  it("keeps moved shapes inside page bounds", () => {
    expect(
      movePdfShape(
        { type: "rectangle", x: 90, y: 90, width: 20, height: 20 },
        30,
        30,
        100,
        100,
      ),
    ).toMatchObject({ x: 80, y: 80 });
  });

  it("bounds a newly placed box without clipping it at the page edge", () => {
    expect(
      boundPdfShape(
        { type: "text", x: 600, y: 780, width: 160, height: 48 },
        612,
        792,
      ),
    ).toMatchObject({ x: 452, y: 744, width: 160, height: 48 });
  });

  it("moves pen and arrow geometry as a whole", () => {
    expect(
      movePdfShape(
        {
          type: "pen",
          points: [
            { x: 5, y: 10 },
            { x: 90, y: 80 },
          ],
        },
        30,
        -50,
        100,
        100,
      ).points,
    ).toEqual([
      { x: 15, y: 0 },
      { x: 100, y: 70 },
    ]);
    expect(
      movePdfShape(
        { type: "arrow", x: 10, y: 20, x2: 80, y2: 70 },
        -30,
        50,
        100,
        100,
      ),
    ).toMatchObject({ x: 0, y: 50, x2: 70, y2: 100 });
  });

  it("keeps the visible rotated bounds inside the page", () => {
    const shape = boundPdfShape(
      { type: "image", x: 90, y: 90, width: 60, height: 20, rotation: 90 },
      100,
      100,
    );
    const bounds = getPdfShapeBounds(shape);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeCloseTo(100);
    expect(bounds.y + bounds.height).toBeCloseTo(100);
    expect(shape).toMatchObject({ width: 60, height: 20, rotation: 90 });
  });

  it("resizes images proportionally and bounds them to the page", () => {
    const shape = resizePdfShape(
      { type: "image", x: 10, y: 20, width: 40, height: 20, aspect_ratio: 2 },
      { x: 120, y: 110 },
      "se",
      100,
      100,
      true,
    );
    expect(shape.width / shape.height).toBeCloseTo(2);
    expect(shape.x + shape.width).toBeLessThanOrEqual(100);
    expect(shape.y + shape.height).toBeLessThanOrEqual(100);
    expect(shape.x).toBeCloseTo(10);
    expect(shape.y).toBeCloseTo(20);
  });

  it("keeps the opposite rotated corner fixed while resizing", () => {
    const original = {
      type: "rectangle",
      x: 60,
      y: 60,
      width: 40,
      height: 20,
      rotation: 90,
    };
    const resized = resizePdfShape(original, { x: 50, y: 100 }, "se", 200, 200);
    const originalAnchor = { x: 90, y: 50 };
    const resizedAnchor = {
      x: resized.x + resized.width / 2 + resized.height / 2,
      y: resized.y + resized.height / 2 - resized.width / 2,
    };
    expect(resizedAnchor.x).toBeCloseTo(originalAnchor.x);
    expect(resizedAnchor.y).toBeCloseTo(originalAnchor.y);
  });

  it("rejects unfinished gestures and retains the larger crop minimum", () => {
    expect(isValidPdfShape({ type: "pen", points: [{ x: 1, y: 1 }] })).toBe(
      false,
    );
    expect(
      isValidPdfShape({
        type: "pen",
        points: [
          { x: 1, y: 1 },
          { x: 2.5, y: 2.5 },
        ],
      }),
    ).toBe(false);
    expect(
      isValidPdfShape({
        type: "pen",
        points: [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
        ],
      }),
    ).toBe(true);
    expect(isValidPdfShape({ type: "arrow", x: 1, y: 1, x2: 1, y2: 1 })).toBe(
      false,
    );
    expect(isValidPdfShape({ type: "rectangle", width: 0, height: 0 })).toBe(
      false,
    );
    expect(isValidPdfShape({ type: "crop", width: 5, height: 5 })).toBe(false);
    expect(isValidPdfShape({ type: "rectangle", width: 5, height: 5 })).toBe(
      true,
    );
    expect(
      boundPdfShape(
        { type: "crop", x: 10, y: 20, width: 1, height: 1 },
        100,
        100,
      ),
    ).toMatchObject({ width: 10, height: 10 });
  });

  it("handles zero-size screen bounds and empty pen paths safely", () => {
    expect(
      screenPointToPdf({
        clientX: 10,
        clientY: 10,
        bounds: { left: 0, top: 0, width: 0, height: 0 },
        pageWidth: 100,
        pageHeight: 100,
      }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      movePdfShape({ type: "pen", points: [] }, 10, 20, 100, 100).points,
    ).toEqual([]);
  });
});
