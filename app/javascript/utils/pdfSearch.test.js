import { describe, expect, it, vi } from "vitest";
import { renderPdfTextItem, searchPdfDocument } from "./pdfSearch";

const pdfWithPages = (pages) => ({
  numPages: pages.length,
  getPage: vi.fn(async (number) => ({
    getTextContent: async () => ({
      items: pages[number - 1].map((item) =>
        typeof item === "string" ? { str: item } : item,
      ),
    }),
  })),
});

describe("PDF find", () => {
  it("finds literal text across items and repeated whitespace with source offsets", async () => {
    const pdf = pdfWithPages([
      ["Account  ", "NUMBER", "   42"],
      ["account number 42"],
    ]);
    const matches = await searchPdfDocument(pdf, "  account\nnumber   42  ");
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      pageNumber: 1,
      itemSlices: {
        0: [{ start: 0, end: 8 }],
        1: [{ start: 0, end: 6 }],
        2: [{ start: 0, end: 5 }],
      },
    });
    expect(matches[1].pageNumber).toBe(2);
  });

  it("handles split words, multiple occurrences and regex punctuation literally", async () => {
    const pdf = pdfWithPages([
      [
        { str: "hel", width: 18, transform: [12, 0, 0, 12, 30, 50] },
        { str: "lo hello", width: 48, transform: [12, 0, 0, 12, 48, 50] },
      ],
      ["a+b a+b aab"],
    ]);
    const words = await searchPdfDocument(pdf, "HELLO");
    expect(words).toHaveLength(2);
    expect(words[0].itemSlices).toEqual({
      0: [{ start: 0, end: 3 }],
      1: [{ start: 0, end: 2 }],
    });
    const punctuation = await searchPdfDocument(pdf, "a+b");
    expect(punctuation).toHaveLength(2);
    expect(new Set(punctuation.map((match) => match.id)).size).toBe(2);
    expect(pdf.getPage).toHaveBeenCalledTimes(2);
  });

  it("does not invent matches by joining visually separated words", async () => {
    const pdf = pdfWithPages([
      [
        { str: "you", width: 18, transform: [12, 0, 0, 12, 30, 50] },
        { str: "own", width: 18, transform: [12, 0, 0, 12, 54, 50] },
      ],
    ]);
    expect(await searchPdfDocument(pdf, "youown")).toEqual([]);
    expect(await searchPdfDocument(pdf, "you own")).toHaveLength(1);
  });

  it("includes editable text objects in page order and excludes non-text shapes", async () => {
    const matches = await searchPdfDocument(
      pdfWithPages([["Other"], ["Approved"]]),
      "approved",
      {
        objects: [
          { id: "text-1", type: "text", page_number: 1, text: "APPROVED" },
          {
            id: "watermark-1",
            type: "watermark",
            page_number: 3,
            text: "Approved",
          },
          { id: "image-1", type: "image", page_number: 1, text: "Approved" },
        ],
      },
    );
    expect(matches.map(({ pageNumber }) => pageNumber)).toEqual([1, 2, 3]);
    expect(matches[0]).toMatchObject({ objectId: "text-1", itemSlices: {} });
  });

  it("finds editable page-number labels across their scoped pages", async () => {
    const pdf = pdfWithPages([["First"], ["Second"], ["Third"]]);
    const objects = [
      {
        id: "numbers",
        type: "page_number",
        start_number: 7,
        format: "page_of_total",
        page_numbers: [3, 1],
      },
    ];
    const matches = await searchPdfDocument(pdf, "PAGE", { objects });
    expect(matches.map(({ pageNumber }) => pageNumber)).toEqual([1, 3]);
    expect(matches.every(({ objectId }) => objectId === "numbers")).toBe(true);
    expect(new Set(matches.map(({ id }) => id)).size).toBe(2);
    expect(
      await searchPdfDocument(pdf, " page\n9  of 3 ", { objects }),
    ).toMatchObject([{ pageNumber: 3, objectId: "numbers", itemSlices: {} }]);
    expect(await searchPdfDocument(pdf, "Page 8", { objects })).toEqual([]);
  });

  it("uses the total page count and preserves zero starting numbers in Find", async () => {
    const pdf = pdfWithPages([["Other"], ["Other"], ["Other"]]);
    const rule = {
      id: "numbers",
      type: "page_number",
      start_number: 0,
      format: "page_of_total",
      page_numbers: [],
    };
    expect(
      await searchPdfDocument(pdf, "page", { objects: [rule] }),
    ).toHaveLength(3);
    expect(
      await searchPdfDocument(pdf, "Page 0 of 3", { objects: [rule] }),
    ).toMatchObject([{ pageNumber: 1, objectId: "numbers" }]);
    expect(
      await searchPdfDocument(pdf, "Page 2 of 3", { objects: [rule] }),
    ).toMatchObject([{ pageNumber: 3, objectId: "numbers" }]);
    expect(
      await searchPdfDocument(pdf, "Page 2 of 3", {
        objects: [{ ...rule, format: "page_number" }],
      }),
    ).toEqual([]);
    expect(
      await searchPdfDocument(pdf, "0", {
        objects: [{ ...rule, format: "number" }],
      }),
    ).toMatchObject([{ pageNumber: 1, objectId: "numbers" }]);
  });

  it("keeps repeated rule matches distinct from PDF and ordinary added text", async () => {
    const matches = await searchPdfDocument(pdfWithPages([["1"]]), "1", {
      objects: [
        {
          id: "numbers",
          type: "page_number",
          start_number: 1,
          format: "page_of_total",
        },
        { id: "text-1", type: "text", page_number: 1, text: "1" },
      ],
    });
    expect(matches).toHaveLength(4);
    expect(new Set(matches.map(({ id }) => id)).size).toBe(4);
    expect(
      matches.filter(({ objectId }) => objectId === "numbers"),
    ).toHaveLength(2);
  });

  it("aborts stale searches between PDF pages", async () => {
    const controller = new AbortController();
    const pdf = pdfWithPages([["one"], ["two"]]);
    await expect(
      searchPdfDocument(pdf, "one", {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    expect(await searchPdfDocument(pdf, " ")).toEqual([]);
  });

  it("escapes text and match attributes while preserving separate active occurrences", () => {
    const html = renderPdfTextItem('<b> a+b a+b & "', [
      { start: 4, end: 7, matchId: 'first" onmouseover="bad' },
      { start: 8, end: 11, matchId: "second", active: true },
    ]);
    expect(html).toBe(
      '&lt;b&gt; <mark data-pdf-find-id="first&quot; onmouseover=&quot;bad" class="pdf-find-match">a+b</mark> <mark data-pdf-find-id="second" class="pdf-find-match active">a+b</mark> &amp; &quot;',
    );
  });
});
