const textCache = new WeakMap();

export const escapePdfHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

/** React-PDF customTextRenderer returns HTML, so both text and attributes must be escaped. */
export function renderPdfTextItem(text, slices = []) {
  const value = String(text ?? "");
  const ranges = slices
    .map((slice) => ({
      ...slice,
      start: Math.max(0, Math.min(value.length, Number(slice.start) || 0)),
      end: Math.max(0, Math.min(value.length, Number(slice.end) || 0)),
    }))
    .filter(({ start, end }) => end > start)
    .sort(
      (a, b) =>
        a.start - b.start ||
        Number(Boolean(b.active)) - Number(Boolean(a.active)),
    );
  let cursor = 0;
  let html = "";
  ranges.forEach((slice) => {
    const start = Math.max(cursor, slice.start);
    if (slice.end <= start) return;
    html += escapePdfHtml(value.slice(cursor, start));
    const id = slice.matchId
      ? ` data-pdf-find-id="${escapePdfHtml(slice.matchId)}"`
      : "";
    html += `<mark${id} class="pdf-find-match${slice.active ? " active" : ""}">${escapePdfHtml(value.slice(start, slice.end))}</mark>`;
    cursor = slice.end;
  });
  return html + escapePdfHtml(value.slice(cursor));
}

const abortIfNeeded = (signal) => {
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
};

const normalizedQuery = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function pdfPageNumberText(rule, pageNumber, totalPages) {
  const number = Number(rule.start_number ?? 1) + pageNumber - 1;
  return rule.format === "number"
    ? String(number)
    : rule.format === "page_number"
      ? `Page ${number}`
      : `Page ${number} of ${totalPages}`;
}

function itemBoundaryHasSpace(previous, current) {
  if (!previous) return false;
  if (previous.hasEOL) return true;
  const before = previous.transform;
  const after = current.transform;
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    Number.isFinite(previous.width)
  ) {
    const scale = Math.hypot(before[0], before[1]);
    if (scale > 0) {
      const dx = after[4] - before[4];
      const dy = after[5] - before[5];
      const advance = (dx * before[0] + dy * before[1]) / scale;
      const baselineDistance = Math.abs(
        (-dx * before[1] + dy * before[0]) / scale,
      );
      // Styled text can be split mid-word. Only join items that touch on the same baseline.
      if (
        baselineDistance < scale / 2 &&
        advance - previous.width <= scale * 0.15 &&
        advance >= 0
      )
        return false;
    }
  }
  return true;
}

function normalizedItems(items) {
  let text = "";
  const offsets = [];
  const append = (value, itemIndex) => {
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (/\s/.test(character)) {
        if (text && !text.endsWith(" ")) {
          text += " ";
          offsets.push(itemIndex === null ? null : { itemIndex, index });
        }
      } else {
        const lower = character.toLowerCase();
        text += lower;
        for (let part = 0; part < lower.length; part += 1)
          offsets.push({ itemIndex, index });
      }
    }
  };
  items.forEach((item, index) => {
    if (
      index &&
      itemBoundaryHasSpace(items[index - 1], item) &&
      text &&
      !text.endsWith(" ") &&
      item.str &&
      !/^\s/.test(item.str)
    )
      append(" ", null);
    append(String(item.str || ""), index);
    if (item.hasEOL) append(" ", null);
  });
  return { text, offsets };
}

function literalOccurrences(text, query) {
  const offsets = [];
  let from = 0;
  while (from <= text.length - query.length) {
    const offset = text.indexOf(query, from);
    if (offset < 0) break;
    offsets.push(offset);
    from = offset + query.length;
  }
  return offsets;
}

function pageMatches(items, query, pageNumber) {
  const matches = [];
  const { text, offsets } = normalizedItems(items);
  literalOccurrences(text, query).forEach((offset) => {
    const itemSlices = {};
    offsets.slice(offset, offset + query.length).forEach((position) => {
      if (!position) return;
      const slices = (itemSlices[position.itemIndex] ||= []);
      if (!slices.length)
        slices.push({ start: position.index, end: position.index + 1 });
      else slices[0].end = Math.max(slices[0].end, position.index + 1);
    });
    if (Object.keys(itemSlices).length)
      matches.push({
        id: `pdf-${pageNumber}-${matches.length}`,
        pageNumber,
        itemSlices,
      });
  });
  return matches;
}

async function cachedTextContent(pdf, pageNumber) {
  let pages = textCache.get(pdf);
  if (!pages) textCache.set(pdf, (pages = new Map()));
  if (!pages.has(pageNumber)) {
    pages.set(
      pageNumber,
      Promise.resolve()
        .then(async () => {
          const page = await pdf.getPage(pageNumber);
          return page.getTextContent();
        })
        .catch((error) => {
          pages.delete(pageNumber);
          throw error;
        }),
    );
  }
  return pages.get(pageNumber);
}

export async function searchPdfDocument(
  pdfProxy,
  value,
  { objects = [], signal, onProgress } = {},
) {
  const query = normalizedQuery(value);
  if (!query) return [];
  const matches = [];
  const totalPages = Number(pdfProxy?.numPages || 0);
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    abortIfNeeded(signal);
    let content;
    try {
      content = await cachedTextContent(pdfProxy, pageNumber);
    } catch (error) {
      abortIfNeeded(signal);
      throw error;
    }
    abortIfNeeded(signal);
    matches.push(...pageMatches(content.items || [], query, pageNumber));
    onProgress?.({ pageNumber, completedPages: pageNumber, totalPages });
  }
  abortIfNeeded(signal);
  objects.forEach((object) => {
    if (object.type === "page_number") {
      const pages = object.page_numbers?.length
        ? [...new Set(object.page_numbers.map(Number))]
        : Array.from({ length: totalPages }, (_, index) => index + 1);
      pages
        .filter(
          (pageNumber) =>
            Number.isInteger(pageNumber) &&
            pageNumber >= 1 &&
            pageNumber <= totalPages,
        )
        .forEach((pageNumber) => {
          const text = normalizedQuery(
            pdfPageNumberText(object, pageNumber, totalPages),
          );
          literalOccurrences(text, query).forEach((offset) =>
            matches.push({
              id: `object-${object.id}-page-${pageNumber}-${offset}`,
              pageNumber,
              objectId: object.id,
              itemSlices: {},
            }),
          );
        });
      return;
    }
    if (!["text", "watermark"].includes(object.type) || !object.text) return;
    const text = normalizedQuery(object.text);
    literalOccurrences(text, query).forEach((offset) =>
      matches.push({
        id: `object-${object.id}-${offset}`,
        pageNumber: Number(object.page_number || 1),
        objectId: object.id,
        itemSlices: {},
      }),
    );
  });
  return matches.sort((a, b) => a.pageNumber - b.pageNumber);
}
