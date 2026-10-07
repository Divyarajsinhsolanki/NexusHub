export const clampNumber = (value, min, max) => {
  const number = Number(value);
  return Math.min(
    Math.max(Number.isFinite(number) ? number : 0, min),
    Math.max(min, max),
  );
};

export const screenPointToPdf = ({
  clientX,
  clientY,
  bounds,
  pageWidth,
  pageHeight,
}) => ({
  x:
    bounds.width > 0
      ? clampNumber(
          ((clientX - bounds.left) / bounds.width) * pageWidth,
          0,
          pageWidth,
        )
      : 0,
  y:
    bounds.height > 0
      ? clampNumber(
          ((clientY - bounds.top) / bounds.height) * pageHeight,
          0,
          pageHeight,
        )
      : 0,
});

export const normalizedRectangle = (start, end) => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

// Editor objects use the viewport's rotated top-left coordinates in raw PDF
// units. PDF.js also scales its viewport by UserUnit, which the composed PDF
// already applies when drawing these same objects.
export const editorPageViewport = (page) => {
  const userUnit = Number(page.userUnit);
  return page.getViewport({
    scale: 1 / (Number.isFinite(userUnit) && userUnit > 0 ? userUnit : 1),
  });
};

export const proportionalRectangle = (
  start,
  end,
  aspectRatio,
  pageWidth,
  pageHeight,
) => {
  const ratio = Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio <= 0)
    return normalizedRectangle(start, end);
  let width = Math.max(
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y) * ratio,
  );
  let height = width / ratio;
  const left = end.x < start.x;
  const top = end.y < start.y;
  const availableWidth = left ? start.x : pageWidth - start.x;
  const availableHeight = top ? start.y : pageHeight - start.y;
  const factor = Math.min(
    1,
    availableWidth / Math.max(width, Number.EPSILON),
    availableHeight / Math.max(height, Number.EPSILON),
  );
  width *= Math.max(0, factor);
  height *= Math.max(0, factor);
  return {
    x: left ? start.x - width : start.x,
    y: top ? start.y - height : start.y,
    width,
    height,
  };
};

export const appendPdfPenPoint = (points, point, maximum = 2000) => {
  // Keep the endpoints while reducing sampling density on very long strokes.
  // The server accepts at most 2000 points per editable pen object.
  const retained =
    points.length < maximum
      ? points
      : points.filter(
          (_, index) => index % 2 === 0 || index === points.length - 1,
        );
  return [...retained, point];
};

export const getPdfShapeBounds = (shape) => {
  let points;
  if (shape.type === "pen") points = shape.points || [];
  else if (shape.type === "arrow")
    points = [
      { x: shape.x, y: shape.y },
      { x: shape.x2, y: shape.y2 },
    ];
  else {
    const width = Number(shape.width) || 0;
    const height = Number(shape.height) || 0;
    const x = Number(shape.x) || 0;
    const y = Number(shape.y) || 0;
    const angle = ((Number(shape.rotation) || 0) * Math.PI) / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    points = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([px, py]) => ({
      x: cx + (px - cx) * Math.cos(angle) - (py - cy) * Math.sin(angle),
      y: cy + (px - cx) * Math.sin(angle) + (py - cy) * Math.cos(angle),
    }));
  }
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => Number(point.x) || 0);
  const ys = points.map((point) => Number(point.y) || 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export const movePdfShape = (shape, dx, dy, pageWidth, pageHeight) => {
  const bounds = getPdfShapeBounds(shape);
  const boundedDx = clampNumber(
    dx,
    -bounds.x,
    pageWidth - bounds.x - bounds.width,
  );
  const boundedDy = clampNumber(
    dy,
    -bounds.y,
    pageHeight - bounds.y - bounds.height,
  );
  if (shape.type === "pen")
    return {
      ...shape,
      points: (shape.points || []).map((point) => ({
        x: point.x + boundedDx,
        y: point.y + boundedDy,
      })),
    };
  if (shape.type === "arrow")
    return {
      ...shape,
      x: shape.x + boundedDx,
      y: shape.y + boundedDy,
      x2: shape.x2 + boundedDx,
      y2: shape.y2 + boundedDy,
    };
  return {
    ...shape,
    x: (Number(shape.x) || 0) + boundedDx,
    y: (Number(shape.y) || 0) + boundedDy,
  };
};

// Keep local dimensions while bounding the visible, rotated rectangle.
export const boundPdfShape = (shape, pageWidth, pageHeight) => {
  if (["pen", "arrow"].includes(shape.type))
    return movePdfShape(shape, 0, 0, pageWidth, pageHeight);
  const minimum = shape.type === "crop" ? 10 : 2;
  let bounded = {
    ...shape,
    width: Math.max(minimum, Number(shape.width) || minimum),
    height: Math.max(minimum, Number(shape.height) || minimum),
  };
  const bounds = getPdfShapeBounds(bounded);
  const factor = Math.min(
    1,
    pageWidth / Math.max(1, bounds.width),
    pageHeight / Math.max(1, bounds.height),
  );
  if (factor < 1)
    bounded = {
      ...bounded,
      width: bounded.width * factor,
      height: bounded.height * factor,
    };
  return movePdfShape(bounded, 0, 0, pageWidth, pageHeight);
};

export const resizePdfShape = (
  shape,
  point,
  handle,
  pageWidth,
  pageHeight,
  preserveAspect = false,
) => {
  const angle = ((Number(shape.rotation) || 0) * Math.PI) / 180;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const localPoint = {
    x: cx + (point.x - cx) * Math.cos(angle) + (point.y - cy) * Math.sin(angle),
    y: cy - (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle),
  };
  const left = handle.includes("w");
  const top = handle.includes("n");
  const anchor = {
    x: left ? shape.x + shape.width : shape.x,
    y: top ? shape.y + shape.height : shape.y,
  };
  const minimum = shape.type === "crop" ? 10 : 2;
  let width = Math.max(
    minimum,
    left ? anchor.x - localPoint.x : localPoint.x - anchor.x,
  );
  let height = Math.max(
    minimum,
    top ? anchor.y - localPoint.y : localPoint.y - anchor.y,
  );
  if (preserveAspect) {
    const ratio =
      Number(shape.aspect_ratio) > 0
        ? Number(shape.aspect_ratio)
        : shape.width / shape.height;
    width = Math.max(width, height * ratio);
    height = width / ratio;
  }
  const worldAnchor = {
    x:
      cx +
      (anchor.x - cx) * Math.cos(angle) -
      (anchor.y - cy) * Math.sin(angle),
    y:
      cy +
      (anchor.x - cx) * Math.sin(angle) +
      (anchor.y - cy) * Math.cos(angle),
  };
  const resized = (nextWidth, nextHeight) => {
    const dx = ((left ? -1 : 1) * nextWidth) / 2;
    const dy = ((top ? -1 : 1) * nextHeight) / 2;
    return {
      ...shape,
      x:
        worldAnchor.x +
        dx * Math.cos(angle) -
        dy * Math.sin(angle) -
        nextWidth / 2,
      y:
        worldAnchor.y +
        dx * Math.sin(angle) +
        dy * Math.cos(angle) -
        nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    };
  };
  const bounds = getPdfShapeBounds(resized(width, height));
  let factor = 1;
  if (bounds.x < 0)
    factor = Math.min(factor, worldAnchor.x / (worldAnchor.x - bounds.x));
  if (bounds.y < 0)
    factor = Math.min(factor, worldAnchor.y / (worldAnchor.y - bounds.y));
  if (bounds.x + bounds.width > pageWidth)
    factor = Math.min(
      factor,
      (pageWidth - worldAnchor.x) / (bounds.x + bounds.width - worldAnchor.x),
    );
  if (bounds.y + bounds.height > pageHeight)
    factor = Math.min(
      factor,
      (pageHeight - worldAnchor.y) / (bounds.y + bounds.height - worldAnchor.y),
    );
  if (factor > 0) {
    width *= factor;
    height *= factor;
  }
  return boundPdfShape(resized(width, height), pageWidth, pageHeight);
};

export const isValidPdfShape = (shape) => {
  if (shape.type === "pen") {
    const points = shape.points || [];
    const bounds = getPdfShapeBounds(shape);
    return points.length >= 2 && (bounds.width >= 2 || bounds.height >= 2);
  }
  if (shape.type === "arrow")
    return Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) >= 2;
  const minimum = shape.type === "crop" ? 10 : 2;
  return Number(shape.width) >= minimum && Number(shape.height) >= minimum;
};
