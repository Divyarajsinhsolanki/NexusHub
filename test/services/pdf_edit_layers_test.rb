require "test_helper"
require "open3"
require "zlib"
require "minitest/mock"

class PdfEditLayersTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "Editable PDFs", slug: "editable-pdfs", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "editable-pdfs@example.test")
    Current.workspace, Current.user = @workspace, @user
    @files = []
    @document = document(pages: 3)
  end

  teardown { @files.each(&:close!) }

  test "saving updating deleting and undoing objects uses an immutable background" do
    perform_operation("save_objects", objects: [text("first", "First editable text")])
    layer = @document.reload.current_version.edit_layer
    assert layer.background.attached?
    assert_equal @document.original_version.file.blob_id, layer.background.blob_id
    assert_includes extracted(@document), "First editable text"
    refute_includes layer.background.open { |file| PdfDocuments::TextExtractor.call(file.path, max_bytes: 1.megabyte) }, "First editable text"

    perform_operation("save_objects", objects: [text("first", "Updated editable text")])
    assert_equal layer.id, @document.reload.current_version.edit_layer_id
    assert_equal 1, extracted(@document).scan("Updated editable text").length
    refute_includes extracted(@document), "First editable text"
    perform_operation("save_objects", objects: [])
    assert_empty objects
    refute_includes extracted(@document), "Updated editable text"
    PdfDocuments::Manager.move_history!(document: @document, target_version: @document.undo_version)
    assert_equal "Updated editable text", objects.first["text"]
  end

  test "history movement rejects a document changed after the caller loaded it" do
    snapshot = PdfDocument.find(@document.id)
    original = snapshot.current_version
    perform_operation("save_objects", objects: [text("latest", "Newer changes must remain current")])
    current = @document.reload.current_version_id
    assert_raises(PdfDocuments::Manager::StaleVersion) do
      PdfDocuments::Manager.move_history!(document: snapshot, target_version: original)
    end
    assert_equal current, @document.reload.current_version_id
    assert_includes extracted(@document).gsub(/\s+/, " "), "Newer changes must remain current"
  end

  test "multiple images keep stable asset keys and share assets across history" do
    image = png
    upload = Rack::Test::UploadedFile.new(image.path, "image/png")
    first = { id: "image-a", type: "image", page_number: 1, x: 20, y: 80, width: 80, height: 40, asset_id: "asset-a" }
    second = first.merge(id: "signature-b", type: "signature", page_number: 2)
    perform_operation("save_objects", { objects: [first, second, text("note", "Alongside images")] }, assets: { "asset-a" => upload })
    layer = @document.reload.current_version.edit_layer
    assert_equal ["asset-a"], layer.asset_map.keys
    assert_equal ["asset-a", "asset-a"], objects.filter_map { |shape| shape["asset_id"] }
    first["asset_url"] = "https://untrusted.example/image"
    perform_operation("save_objects", objects: [first.merge(x: 40), second])
    assert_equal layer.id, @document.reload.current_version.edit_layer_id
    assert_equal 1, layer.assets.count
    refute @document.current_version.metadata["objects"].first.key?("asset_url")
  end

  test "reorder duplicate blank and delete remap editable page objects" do
    perform_operation("save_objects", objects: [text("one", "Object one", page: 1), text("three", "Object three", page: 3)])
    perform_operation("reorder_pages", page_order: [3, 1, 2])
    assert_equal [2, 1], objects.map { |object| object["page_number"] }
    perform_operation("duplicate_pages", page_numbers: [1])
    duplicated = objects.select { |object| object["text"] == "Object three" }
    assert_equal [1, 2], duplicated.map { |object| object["page_number"] }
    assert_equal 2, duplicated.map { |object| object["id"] }.uniq.length
    perform_operation("add_blank_page", position: 2)
    assert_equal 5, @document.reload.page_count
    assert_equal [4, 1, 3], objects.map { |object| object["page_number"] }
    perform_operation("delete_pages", page_numbers: [1, 2])
    assert_equal [2, 1], objects.map { |object| object["page_number"] }
    refute_includes extracted(@document), "PDF test document page 2 page 1"
  end

  test "cropped nonzero-origin rotated image stays aligned after reopening and saving" do
    source = create_test_pdf(pages: 1)
    @files << source
    pdf = HexaPDF::Document.open(source.path)
    pdf.pages[0].box(:media, [20, 30, 320, 230])
    pdf.pages[0].box(:crop, [70, 60, 270, 190])
    pdf.write(source.path)
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "offset.pdf")
    shape = { id: "aligned", type: "image", page_number: 1, x: 10, y: 15, width: 40, height: 20, asset_id: "green" }
    perform_operation("save_objects", { objects: [shape] }, assets: { "green" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    assert_green(pixel(@document, 25, 25))
    perform_operation("rotate_pages", page_numbers: [1], degrees: 90)
    rotated = objects.first
    assert_in_delta 90, rotated["rotation"], 0.01
    assert_in_delta 85, rotated["x"], 0.01
    assert_in_delta 20, rotated["y"], 0.01
    assert_green(pixel(@document, 105, 30))
    perform_operation("save_objects", objects: objects)
    assert_green(pixel(@document, 105, 30))
    perform_operation("crop", page_number: 1, x: 90, y: 5, width: 30, height: 80)
    assert_green(pixel(@document, 15, 25))
    perform_operation("save_objects", objects: objects)
    assert_green(pixel(@document, 15, 25))
  end

  test "blank insertion retains the reference page user unit rotation and crop box" do
    source = create_test_pdf(pages: 1)
    @files << source
    pdf = HexaPDF::Document.open(source.path)
    page = pdf.pages[0]
    page[:UserUnit] = 2
    page[:Rotate] = 90
    page.box(:crop, [50, 70, 350, 470])
    pdf.write(source.path)
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "scaled-blank.pdf")
    perform_operation("add_blank_page", position: 2, reference_page_number: 1)
    @document.reload.current_version.file.open do |file|
      output = HexaPDF::Document.open(file.path)
      first, blank = output.pages.to_a
      assert_equal first[:UserUnit], blank[:UserUnit]
      assert_equal first[:Rotate], blank[:Rotate]
      assert_equal first.box(:media).value, blank.box(:media).value
      assert_equal first.box(:crop).value, blank.box(:crop).value
      assert_empty blank.contents
    end
  end

  test "page number rules and strikethrough remain editable and export visible text" do
    perform_operation("save_objects", objects: [
      { id: "numbers", type: "page_number", position: "bottom-center", start_number: 4, format: "page_of_total" },
      { id: "strike", type: "strike", page_number: 1, x: 10, y: 10, width: 100, height: 20, color: "#ff0000", opacity: 1 },
      text("unicode", "Résumé ₹ Привет")
    ])
    output = extracted(@document)
    assert_includes output, "Page 4 of 3"
    assert_includes output, "Page 6 of 3"
    assert_includes output, "Résumé ₹ Привет"
    assert_equal "page_number", objects.first["type"]
    assert_equal "strike", objects.second["type"]
  end

  test "every annotation type exports its actual colors opacity images and text" do
    shapes = [text("text", "Visible exported text"), text("watermark", "Visible watermark").merge(type: "watermark", y: 155, opacity: 0.25),
      { id: "highlight", type: "highlight", page_number: 1, x: 20, y: 210, width: 80, height: 20 },
      { id: "rectangle", type: "rectangle", page_number: 1, x: 20, y: 250, width: 80, height: 20, color: "#ff0000", fill_color: "#ff0000", opacity: 0.5 },
      { id: "arrow", type: "arrow", page_number: 1, x: 20, y: 300, x2: 100, y2: 300, color: "#ff0000" },
      { id: "pen", type: "pen", page_number: 1, points: [{ x: 20, y: 340 }, { x: 100, y: 340 }], color: "#0000ff" },
      { id: "strike", type: "strike", page_number: 1, x: 20, y: 370, width: 80, height: 20, color: "#ff0000" },
      { id: "image", type: "image", page_number: 1, x: 20, y: 410, width: 80, height: 40, asset_id: "green", opacity: 0.5 },
      { id: "signature", type: "signature", page_number: 1, x: 20, y: 470, width: 80, height: 40, asset_id: "green" },
      { id: "stamp", type: "stamp", page_number: 1, x: 20, y: 530, width: 80, height: 40, asset_id: "green" },
      { id: "numbers", type: "page_number", page_numbers: [1], position: "bottom-center", format: "page_number", start_number: 7 }]
    perform_operation("save_objects", { objects: shapes }, assets: { "green" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    output = extracted(@document)
    ["Visible exported text", "Visible watermark", "Page 7"].each { |text| assert_includes output, text }
    assert_color(pixel(@document, 50, 220), [255, 244, 189])
    assert_color(pixel(@document, 50, 260), [255, 127, 127])
    assert_color(pixel(@document, 50, 300), [255, 0, 0])
    assert_color(pixel(@document, 50, 340), [0, 0, 255])
    assert_color(pixel(@document, 50, 380), [255, 0, 0])
    assert_color(pixel(@document, 50, 430), [127, 255, 127])
    assert_green(pixel(@document, 50, 490))
    assert_green(pixel(@document, 50, 550))
  end

  test "zero size paths and moving saved objects off page are rejected" do
    arrow = { id: "arrow", type: "arrow", page_number: 1, x: 20, y: 20, x2: 20, y2: 20 }
    pen = { id: "pen", type: "pen", page_number: 1, points: [{ x: 20, y: 20 }, { x: 20, y: 20 }] }
    [arrow, pen].each { |object| assert_raises(ArgumentError) { perform_operation("save_objects", objects: [object]) } }
    perform_operation("save_objects", objects: [text("stable", "Saved inside the page")])
    assert_raises(ArgumentError) { perform_operation("save_objects", objects: [objects.first.merge("x" => 10_000)]) }
    assert_includes extracted(@document), "Saved inside the page"
  end

  test "invalid and foreign image objects fail without creating partial versions" do
    perform_operation("save_objects", { objects: [{ id: "image", type: "image", page_number: 1, x: 10, y: 10, width: 40, height: 20, asset_id: "private" }] },
      assets: { "private" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    @document = document(pages: 1)
    before = @document.current_version_id
    assert_raises(ArgumentError) do
      perform_operation("save_objects", objects: [{ id: "image", type: "image", page_number: 1, x: 10, y: 10, width: 40, height: 20, asset_id: "private" }])
    end
    assert_equal before, @document.reload.current_version_id
    assert_raises(ArgumentError) { perform_operation("save_objects", objects: [text("unsupported", "नमस्ते")]) }
    assert_equal before, @document.reload.current_version_id
  end

  test "queued exports use submitted snapshots and completed jobs do not run twice" do
    perform_operation("save_objects", objects: [text("queued", "Queued snapshot")])
    source_version = @document.reload.current_version
    operation = operation("extract_text", {}, version: source_version)
    perform_operation("save_objects", objects: [text("queued", "Newer snapshot")])
    PdfDocuments::OperationRunner.new(operation).run!
    artifact = operation.reload.artifacts.first
    assert_includes artifact.file.download, "Queued snapshot"
    refute_includes artifact.file.download, "Newer snapshot"
    assert_no_difference("PdfDocumentArtifact.count") { PdfDocuments::OperationRunner.new(operation).run! }
  end

  test "queued exports survive history pruning and release their source lease" do
    perform_operation("save_objects", objects: [text("queued", "Pruned queued snapshot")])
    source = @document.reload.current_version
    queued = operation("extract_text", {}, version: source)
    blob = source.file.blob
    20.times { |index| perform_operation("save_objects", objects: [text("queued", "Later edit #{index}")]) }
    refute PdfDocumentVersion.exists?(source.id)
    assert_nil queued.reload.base_version_id
    assert blob.attachments.exists?(record: queued)
    PdfDocuments::OperationRunner.new(queued).run!
    assert_includes queued.reload.artifacts.first.file.download, "Pruned queued snapshot"
    assert_empty queued.source_files
    refute blob.attachments.exists?
  end

  test "queued extraction preserves backgrounds and images after abandoned redo is pruned" do
    image = { id: "leased-image", type: "image", page_number: 1, x: 20, y: 80, width: 80, height: 40, asset_id: "leased-asset" }
    perform_operation("save_objects", { objects: [image, text("queued", "Abandoned editable source")] },
      assets: { "leased-asset" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    source = @document.reload.current_version
    queued = operation("extract_pages", { page_numbers: [1] }, version: source)
    leased_blob = source.edit_layer.asset_map.fetch("leased-asset").blob
    PdfDocuments::Manager.move_history!(document: @document, target_version: @document.original_version)
    perform_operation("save_objects", objects: [text("replacement", "New branch")])
    refute PdfDocumentVersion.exists?(source.id)
    assert leased_blob.attachments.exists?(record: queued)
    derived = PdfDocuments::OperationRunner.new(queued).run!.first
    assert_includes extracted(derived), "Abandoned editable source"
    assert_equal "leased-asset", derived.current_version.metadata["objects"].first.fetch("asset_id")
    assert_green(pixel(derived, 40, 95))
    assert leased_blob.attachments.exists?(record_type: "PdfDocumentEditLayer")
  end

  test "processing operations cannot be claimed by a second runner" do
    queued = operation("extract_text", {})
    queued.update!(status: "processing")
    assert_no_difference("PdfDocumentArtifact.count") { PdfDocuments::OperationRunner.new(queued).run! }
    assert_equal "processing", queued.reload.status
    assert queued.source_files.attached?
  end

  test "queued mutations fail stale without appending another version" do
    original = @document.current_version
    queued = operation("compress", {}, version: original)
    perform_operation("save_objects", objects: [text("later", "Changed after queue")])
    current = @document.reload.current_version_id
    assert_raises(PdfDocuments::Manager::StaleVersion) { PdfDocuments::OperationRunner.new(queued).run! }
    assert_equal current, @document.reload.current_version_id
    assert_equal "failed", queued.reload.status
  end

  test "split ranges preserve page ordering and editable objects and replay is harmless" do
    perform_operation("save_objects", objects: [text("one", "First page object", page: 1), text("three", "Last page object", page: 3)])
    source = @document.reload.current_version
    operation = operation("split_by_ranges", { page_groups: [[3, 1], [2]] }, version: source)
    result = PdfDocuments::OperationRunner.new(operation).run!
    assert_equal [2, 1], result.map(&:page_count)
    first_objects = Array(result.first.current_version.metadata["objects"])
    assert_equal [2, 1], first_objects.map { |object| object["page_number"] }
    assert_empty result.second.current_version.metadata["objects"]
    assert first_objects.all? { |object| !%w[one three].include?(object["id"]) }
    assert_no_difference("PdfDocument.count") { PdfDocuments::OperationRunner.new(operation).run! }
    assert_raises(ArgumentError) { perform_operation("split_by_ranges", page_groups: [[1, 2], [2, 3]]) }
  end

  test "split publication rolls back all outputs when quota is exceeded" do
    before = PdfDocument.count
    PdfDocument.stub(:document_limit_for, before + 1) do
      assert_raises(PdfDocuments::Manager::QuotaExceeded) { perform_operation("split_by_ranges", page_groups: [[1], [2, 3]]) }
    end
    assert_equal before, PdfDocument.count
  end

  test "merge reads captured source versions and preserves independent editable layers" do
    perform_operation("save_objects", objects: [text("first", "Captured first")])
    first = @document.reload.current_version
    other = document(pages: 1)
    sources = [{ document_id: @document.id, version_id: first.id }, { document_id: other.id, version_id: other.current_version_id }]
    merge = operation("merge", { source_versions: sources, title: "Combined" })
    perform_operation("save_objects", objects: [text("first", "Changed first")])
    merged = PdfDocuments::OperationRunner.new(merge).run!.first
    assert_equal 4, merged.page_count
    assert_includes extracted(merged), "Captured first"
    refute_includes extracted(merged), "Changed first"
    assert_equal 1, merged.current_version.metadata["objects"].length
  end

  test "ordered merge keeps distinct images that use the same asset identifier" do
    image = { id: "image", type: "image", page_number: 1, x: 20, y: 180, width: 80, height: 40, asset_id: "same-key" }
    first = @document
    perform_operation("save_objects", { objects: [image, text("first", "First source")] },
      assets: { "same-key" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    @document = document(pages: 1)
    other = @document
    perform_operation("save_objects", { objects: [image, text("other", "Other source")] },
      assets: { "same-key" => Rack::Test::UploadedFile.new(png(color: [255, 0, 0]).path, "image/png") })
    @document = first
    merge = operation("merge", { source_versions: [other, first].map { |document| { document_id: document.id, version_id: document.current_version_id } } })
    result = PdfDocuments::OperationRunner.new(merge).run!.first
    output = extracted(result)
    assert_operator output.index("Other source"), :<, output.index("First source")
    assert_equal 2, result.current_version.edit_layer.asset_map.length
    assert_color(pixel(result, 50, 200), [255, 0, 0])
    assert_green(pixel(result, 50, 200, page: 2))
  end

  test "size splitting produces real files within the selected boundary" do
    source = create_test_pdf(pages: 3)
    @files << source
    pdf = HexaPDF::Document.open(source.path)
    random = Random.new(10)
    pdf.pages.each do |page|
      page[:Contents] = pdf.add({ Filter: :FlateDecode }, stream: "#{page.contents}\n%#{random.bytes(350_000).unpack1('H*')}\n")
    end
    pdf.write(source.path)
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "size-split.pdf")
    assert_operator @document.current_version.byte_size, :>, 1.megabyte
    result = perform_operation("split_by_size", max_size_mb: 1)
    assert_equal [2, 1], result.map(&:page_count)
    result.each { |document| assert_operator document.current_version.byte_size, :<=, 1.megabyte }
  end

  test "image export creates a downloadable ZIP with each rendered page" do
    perform_operation("save_objects", objects: [text("exported", "Current exported image")])
    artifact = perform_operation("export_images")
    artifact.file.open do |file|
      Zip::File.open(file.path) do |zip|
        assert_equal %w[page-1.png page-2.png page-3.png], zip.entries.map(&:name)
        zip.entries.each { |entry| assert_equal "\x89PNG\r\n\x1a\n".b, entry.get_input_stream.read(8) }
      end
    end
  end

  test "protect unlock and compression retain editor objects" do
    perform_operation("save_objects", objects: [text("kept", "Keep editing this")])
    layer_id = @document.reload.current_version.edit_layer_id
    perform_operation("protect", {}, password: "StrongPassword42")
    assert @document.reload.encrypted?
    assert_equal layer_id, @document.current_version.edit_layer_id
    perform_operation("unlock", {}, password: "StrongPassword42")
    refute @document.reload.encrypted?
    assert_equal "kept", objects.first["id"]
    perform_operation("compress")
    assert_equal "kept", objects.first["id"]
    assert_equal 1, extracted(@document).scan("Keep editing this").length
  end

  test "redaction removes affected editable objects but retains other page objects" do
    perform_operation("save_objects", objects: [text("secret", "Private editable secret"), text("public", "Keep this editable", page: 2)])
    perform_operation("redact", confirmed: true, regions: [{ page_number: 1, x: 0, y: 0, width: 612, height: 792 }])
    assert_equal ["public"], objects.map { |object| object["id"] }
    refute_includes extracted(@document), "Private editable secret"
    assert_includes extracted(@document), "Keep this editable"
  end

  test "partial redaction covers only its area and undo restores editable objects" do
    source = Tempfile.new(["partial-redaction-", ".pdf"])
    @files << source
    Prawn::Document.generate(source.path, margin: 0) do |pdf|
      pdf.text("Underlying secret content")
      pdf.fill_color("FF0000")
      pdf.fill_rectangle([20, 692], 80, 40)
    end
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "partial.pdf")
    perform_operation("save_objects", objects: [text("editable", "Editable prior to redaction").merge(y: 200)])
    perform_operation("redact", confirmed: true, regions: [{ page_number: 1, x: 20, y: 100, width: 30, height: 40 }])
    assert_color(pixel(@document, 35, 120), [0, 0, 0])
    assert_color(pixel(@document, 70, 120), [255, 0, 0])
    refute_includes extracted(@document), "Underlying secret content"
    assert_empty objects
    PdfDocuments::Manager.move_history!(document: @document, target_version: @document.undo_version)
    assert_equal "editable", objects.first["id"]
    assert_includes extracted(@document), "Underlying secret content"
  end

  test "storage counts shared backgrounds once and survives pruning of history rows" do
    perform_operation("save_objects", objects: [text("original", "Original object")])
    assert_equal @document.versions.sum(:byte_size), @document.storage_bytes
    21.times { |index| perform_operation("save_objects", objects: [text("original", "Version #{index}")]) }
    assert_equal 21, @document.reload.versions.count
    assert @document.current_version.edit_layer.background.attached?
    assert_includes extracted(@document), "Version 20"
  end

  test "abandoned asset dependencies are pruned and quota rejection restores history" do
    perform_operation("save_objects", { objects: [{ id: "image", type: "image", page_number: 1, x: 20, y: 80, width: 80, height: 40, asset_id: "abandoned" }] },
      assets: { "abandoned" => Rack::Test::UploadedFile.new(png.path, "image/png") })
    abandoned = @document.reload.current_version
    asset_blob = abandoned.edit_layer.asset_map.fetch("abandoned").blob
    before = PdfDocuments::Manager.user_usage(@user)[:storage_bytes]
    PdfDocuments::Manager.move_history!(document: @document, target_version: @document.original_version)
    PdfDocument.stub(:storage_limit_for, 1) do
      assert_raises(PdfDocuments::Manager::QuotaExceeded) { perform_operation("save_objects", objects: [text("new", "Rejected new branch")]) }
    end
    assert PdfDocumentVersion.exists?(abandoned.id)
    assert asset_blob.attachments.exists?
    assert_equal before, PdfDocuments::Manager.user_usage(@user)[:storage_bytes]
    perform_operation("save_objects", objects: [text("new", "Accepted new branch")])
    refute PdfDocumentVersion.exists?(abandoned.id)
    refute asset_blob.attachments.exists?
    assert_equal @document.versions.sum(:byte_size), PdfDocuments::Manager.user_usage(@user)[:storage_bytes]
  end

  test "storage counts legacy queued snapshots and shared version files once" do
    version = PdfDocuments::Manager.append_version!(document: @document, created_by: @user, path: @files.first.path,
      operation: "legacy-edit", base_version_id: @document.current_version_id)
    queued = operation("extract_text", {}, version:)
    original = @document.original_version
    PdfDocuments::Manager.move_history!(document: @document, target_version: original)
    replacement = PdfDocuments::Manager.append_version!(document: @document, created_by: @user, path: @files.first.path,
      operation: "legacy-replacement", base_version_id: original.id)
    leased = queued.source_files.first.blob
    assert_equal original.byte_size + replacement.byte_size + leased.byte_size, @document.reload.storage_bytes
    assert_equal @document.storage_bytes, PdfDocuments::Manager.user_usage(@user)[:storage_bytes]
    replacement.file.attach(original.file.blob)
    assert_equal original.byte_size + leased.byte_size, @document.reload.storage_bytes
    assert_equal @document.storage_bytes, PdfDocuments::Manager.user_usage(@user)[:storage_bytes]
    PdfDocuments::OperationRunner.new(queued).run!
    assert_equal original.byte_size, @document.reload.storage_bytes
  end

  test "redaction honors UserUnit while retaining physical page size" do
    source = Tempfile.new(["scaled-pdf-", ".pdf"])
    @files << source
    Prawn::Document.generate(source.path, page_size: [200, 200], margin: 0) do |pdf|
      pdf.fill_color("FF0000")
      pdf.fill_rectangle([20, 100], 80, 40)
    end
    pdf = HexaPDF::Document.open(source.path)
    pdf.pages[0][:UserUnit] = 2
    pdf.write(source.path)
    @document = PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "scaled.pdf")
    perform_operation("redact", confirmed: true, regions: [{ page_number: 1, x: 20, y: 100, width: 30, height: 40 }])
    # This Poppler build renders the raw page units; inspect those pixels and
    # assert the retained UserUnit separately for viewers that apply it.
    assert_color(pixel(@document, 35, 120), [0, 0, 0])
    assert_color(pixel(@document, 70, 120), [255, 0, 0])
    @document.current_version.file.open do |file|
      page = HexaPDF::Document.open(file.path).pages[0]
      assert_equal 2, page[:UserUnit]
      assert_equal 200, page.box(:media).width
    end
  end

  private

  def document(pages:)
    source = create_test_pdf(pages:)
    @files << source
    PdfDocuments::Manager.create_from_path!(user: @user, path: source.path, filename: "editable.pdf")
  end

  def text(id, content, page: 1)
    { id:, type: "text", page_number: page, x: 40, y: 100, width: 280, height: 50, font_size: 16, text: content, color: "#111827" }
  end

  def operation(kind, parameters, version: @document.reload.current_version)
    record = @user.pdf_document_operations.create!(workspace: @workspace, pdf_document: kind == "merge" ? nil : @document,
      base_version: kind == "merge" ? nil : version, kind:, parameters:)
    if PdfDocuments::OperationRunner::ASYNC_KINDS.include?(kind)
      versions = kind == "merge" ? parameters.fetch(:source_versions).map { |source| PdfDocumentVersion.find(source.fetch(:version_id)) } : [version]
      PdfDocuments::Sources.capture!(record, versions)
    end
    record
  end

  def perform_operation(kind, parameters = {}, assets: {}, password: nil, **keyword_parameters)
    parameters = parameters.merge(keyword_parameters)
    record = operation(kind, parameters)
    result = PdfDocuments::OperationRunner.new(record).run!(assets:, password:)
    @document.reload
    result
  end

  def objects
    editor = PdfDocuments::Editor.new(document: @document.reload, user: @user)
    editor.public_objects
  end

  def extracted(document)
    document.reload.current_version.file.open { |file| PdfDocuments::TextExtractor.call(file.path, max_bytes: 1.megabyte) }
  end

  def png(color: [0, 255, 0])
    file = Tempfile.new(["pdf-green-image-", ".png"], binmode: true)
    chunk = ->(type, data) { [data.bytesize].pack("N") + type + data + [Zlib.crc32(type + data)].pack("N") }
    file.write("\x89PNG\r\n\x1a\n".b + chunk.call("IHDR".b, [40, 20, 8, 2, 0, 0, 0].pack("NNCCCCC")) +
      chunk.call("IDAT".b, Zlib::Deflate.deflate(("\x00".b + color.pack("C*") * 40) * 20)) + chunk.call("IEND".b, "".b))
    file.flush
    @files << file
    file
  end

  def pixel(document, x, y, page: 1)
    document.current_version.file.open do |file|
      Dir.mktmpdir("pdf-pixel-test") do |directory|
        prefix = File.join(directory, "page")
        _, error, status = Open3.capture3("pdftoppm", "-cropbox", "-f", page.to_s, "-singlefile", "-png", "-r", "72", file.path, prefix)
        assert status.success?, error
        MiniMagick::Image.open("#{prefix}.png").get_pixels.fetch(y).fetch(x)
      end
    end
  end

  def assert_green(rgb)
    assert_operator rgb[1], :>, 200
    assert_operator rgb[0], :<, 30
    assert_operator rgb[2], :<, 30
  end

  def assert_color(actual, expected)
    expected.zip(actual).each { |channel, value| assert_in_delta channel, value, 8 }
  end
end
