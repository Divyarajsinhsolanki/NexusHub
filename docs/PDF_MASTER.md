# PDF Master

`/pdf-master` keeps the PDF central and organizes controls into five groups. Desktop sidebars and mobile dialogs share the same controls.

Rename a PDF with **Rename** beside its title, then choose **Save name**. The compact desktop header contains the tool groups and active tools. Page navigation, page jump, and zoom controls sit below the left sidebar; on phones and tablets without a sidebar, open **View** in the bottom navigation. The central area stays available for the PDF and Find results.

On desktop, collapse either sidebar with its panel button, or choose **Focus on the PDF** in the header to hide both. Library, Pages, page and zoom settings, and tool Options remain accessible; exiting focus restores the previous sidebar arrangement. Zoom buttons start from the actual displayed scale after Fit page or Fit width.

| Group | Tools |
| --- | --- |
| Edit | Text, images, drawn or uploaded visual signatures, image stamps |
| Annotate | Highlight, pen, rectangle, arrow, strikethrough, watermark |
| Pages | Navigation and selection, reorder, rotate, duplicate, insert, delete, crop, page numbers, extraction, merge, size or custom-group split |
| Secure | Confirmed permanent redaction, password protection and unlock |
| Export | Current PDF download, compression, text extraction, page-image ZIP, generated files |

Added objects remain selectable after reopening. Select an object to change its properties, duplicate it, or delete it. Images resize proportionally. Page-number rules support page ranges, position, starting number, margin, and three formats; numbering follows the document's page order. Find searches extractable PDF text and added text, including phrases spanning PDF text items. It does not perform OCR. Signatures are visual images.

Select mode also allows selecting and copying original PDF text, following web links, and opening internal page links. Page navigation clears selection of an object on another page. Custom split previews identify omitted pages and offer **Include remaining pages**; omitted pages stay in the original document.

Completed drawings, moves, and resizes save immediately. Text and property changes save after 500 ms. The header shows Saving, Saved, or Save failed; Retry preserves the local edits. Saves run in order with the last acknowledged version, and an older response cannot overwrite newer edits. History changes, document switches, structural operations, and downloads flush pending changes first. Internal navigation links also wait for saving; closing the tab with pending changes invokes the browser's unsaved-change prompt.

**Check status** also waits for saving and retains pending crop/redaction regions on failure. Undo, redo, and original restoration include the current version to reject stale requests from another tab. Rename and other dialogs block document keyboard shortcuts while open.

Page thumbnails have separate navigation and selection controls. Select all, range selection, a page jump, Fit width, and Fit page are available. Select mode allows touch panning. Object editing waits until PDF rendering completes.

## Storage and compatibility

Run `bin/rails db:migrate` when deploying this change. `PdfDocumentEditLayer` is additive and initialized when an existing document is first edited. Its immutable background and document-owned image assets are separate from each version's complete object snapshot in metadata. A version's PDF file contains the composed output for downloads, thumbnails, and text extraction; the editor displays the background plus objects, preventing duplicate additions.

Old flattened additions remain in their existing PDF background. Newly created objects remain editable. Page operations remap object coordinates and page scopes; duplicated pages clone object IDs. Extraction, merge, and splitting transfer editor state and required assets. Compression and protection/unlock retain it. Redaction requires confirmation, finalizes affected pages, and removes their editable objects; saved history can undo it.

Redaction also removes finalized pages' form values, annotations, linked attachments and actions; the sanitized PDF omits document structural tagging and alternate text that could retain original content.

Background and asset endpoints enforce document ownership and workspace access, and hide plaintext editor assets while a document is protected. Saved history retains the dependencies it needs. Pruning removes unused dependencies after commit, while storage quotas count shared blobs once. Queued operations capture accepted source files and ordered merge inputs; publication checks versions and publishes prepared outputs with completion status in one transaction. Replayed jobs do not create duplicate results. Compression retains the existing PDF when an attempted output is larger.

Background workers renew a five-minute processing lease every 30 seconds. A watchdog can reclaim interrupted operations; publication checks the worker token so an older worker cannot publish twice. Status checks can recover expired legacy jobs. Renderer and extraction timeouts terminate the subprocess group, including descendants.

The native mobile viewer polls queued operations, resumes them after reopening, and retains an accepted operation ID for status retry after connection failures. Preview URLs include the PDF version to refresh cached files after edits and history changes. Document tools expose generated split PDFs and exported files.

Geometry uses PDF page units and the page's actual CropBox and rotation. Bundled DejaVu Sans fonts are shared between preview and export; unsupported characters produce a visible save error.

## Verification

Run the frontend suite with `npm test`. Focused PDF backend coverage is:

```bash
bin/rails test test/services/pdf_*_test.rb test/requests/pdf_*_test.rb test/models/pdf_document_test.rb
```

Run the complete Rails suite with `bin/rails test` and the production bundle with `RAILS_ENV=production bin/vite build` using the application's required production configuration.

Backend tests inspect actual PDF text, page structure, images, encryption, redaction pixels, rotated/cropped placement, split boundaries, and downloads. They also exercise history, immutable queued sources, replay, asset ownership, pruning, and quota rollback. Frontend tests cover autosave ordering/failure/retry, rendering readiness, gestures, search, responsive dialogs, and the read-only demo.

For browser acceptance, use disposable test accounts and check desktop, tablet, and phone in both themes. Exercise insertion and reopening, signature Clear/undo/upload, proportional resize, Find navigation, history, page operations, page-number scopes, custom/size splits, ordered merge, redaction confirmation, protection/unlock, compression, and generated-file downloads. Compare downloaded PDFs with the preview and check the browser console and page overflow.

Verified on October 7, 2026: 244 frontend tests across 47 files (`npm test -- --maxWorkers=2`), 238 Rails tests with 1,359 assertions, and the production Vite build passed. Chrome acceptance covered all three viewport sizes in both themes, including touch panning, signature transparency, failure/retry, navigation flushing, and visual comparisons with real PDF exports. Disposable browser-test records and servers were cleaned up.

The compact header, sidebar view controls, mobile View dialog, and visible Rename action were additionally verified with 66 focused frontend tests, a production build, and Chrome checks on desktop, tablet, and phone in both themes. Rename persistence, failed rename retry, page navigation, zoom, and tool-group access passed; the desktop page gained 72 pixels of width and started 102 pixels higher in the 1440-pixel acceptance viewport.

Verified on October 10, 2026: all 332 frontend tests across 63 files and all 369 Rails tests with 2,417 assertions passed, including 75 PDF backend cases. The mobile PDF screen, workflow, and endpoint suites passed 24 tests, and mobile TypeScript checks passed. The production Vite build passed. Chrome acceptance covered desktop, tablet, and phone in both themes, including native text copying, document links, fitted zoom, sidebar/focus access, Rename shortcuts, autosave status failure/retry, reopening, and selection across highlights. Wrapped text and page numbers matched downloaded PDFs; replacement redaction matched five-line wrapping and glyph placement within one pixel. Hidden streams, finalized-page form values, linked attachments/actions, and structural alternate text were checked in both the saved background and final download. Disposable records, blobs, tokens, and servers were cleaned up. Native PDF rendering in mobile screen tests was mocked; a physical-device smoke test remains separate from this browser verification.
