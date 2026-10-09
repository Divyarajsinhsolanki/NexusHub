require "test_helper"
require "open3"

class PdfRedactionTest < ActiveSupport::TestCase
  test "secure redaction removes underlying text from affected pages" do
    source, document, user = create_redaction_document("default")

    PdfDocuments::Processor.new(document:, user:).redact!(
      regions: [{ page_number: 1, x: 0, y: 0, width: 612, height: 792 }],
      base_version_id: document.current_version_id
    )

    assert_not_includes extracted_text(document), "SECRET-ACCOUNT-123"
    assert_no_recoverable_secret(document.current_version.file)
    assert_no_recoverable_secret(document.current_version.edit_layer.background)
    # History intentionally retains the original PDF for undo.
    assert_includes decoded_streams(document.original_version.file), "SECRET-ACCOUNT-123"
  ensure
    source&.close!
  end

  test "blank redaction securely removes content without a black block" do
    source, document, user = create_redaction_document("blank")

    PdfDocuments::Processor.new(document:, user:).redact!(
      regions: [{ page_number: 1, x: 0, y: 0, width: 612, height: 792, redaction_mode: "blank" }],
      base_version_id: document.current_version_id
    )

    assert_not_includes extracted_text(document), "SECRET-ACCOUNT-123"
    assert_color_near rendered_pixel(document, x: 300, y: 396), [255, 255, 255]
  ensure
    source&.close!
  end

  test "redaction removes finalized page form values annotations actions and attachments while preserving other pages" do
    source, document, user = create_redaction_document("page-metadata")
    pdf = HexaPDF::Document.open(source.path)
    other_page = pdf.pages.add
    form = pdf.acro_form(create: true)
    secret = form.create_text_field("private.value")
    secret.create_widget(pdf.pages[0], Rect: [20, 640, 280, 690])
    secret.field_value = "SECRET-ACCOUNT-123"
    retained = form.create_text_field("public.value")
    retained.create_widget(other_page, Rect: [20, 640, 280, 690])
    retained.field_value = "PUBLIC-REFERENCE"
    private_file = pdf.files.add(StringIO.new("SECRET-ACCOUNT-123"), name: "private.txt")
    public_file = pdf.files.add(StringIO.new("PUBLIC-REFERENCE"), name: "public.txt")
    action = pdf.add({ S: :JavaScript, JS: "SECRET-ACCOUNT-123" })
    private_annotation = pdf.add({ Type: :Annot, Subtype: :FileAttachment, Rect: [10, 10, 30, 30],
      Contents: "SECRET-ACCOUNT-123", FS: private_file, A: action })
    pdf.pages[0][:Annots] << private_annotation
    other_page[:Annots] << pdf.add({ Type: :Annot, Subtype: :FileAttachment, Rect: [10, 10, 30, 30], FS: public_file })
    pdf.catalog[:AF] = [private_file, public_file]
    pdf.catalog[:Names][:JavaScript] = pdf.add({ Names: ["private-action", action] }, type: :NameTreeNode)
    structure = pdf.add({ Type: :StructTreeRoot })
    structure[:K] = [pdf.add({ Type: :StructElem, S: :P, P: structure, Pg: pdf.pages[0], ActualText: "SECRET-ACCOUNT-123" })]
    pdf.catalog[:StructTreeRoot] = structure
    pdf.catalog[:MarkInfo] = { Marked: true }
    pdf.pages[0][:StructParents] = 0
    pdf.write(source.path, optimize: true)
    document = PdfDocuments::Manager.create_from_path!(user:, path: source.path, filename: "page-metadata.pdf")
    PdfDocuments::Processor.new(document:, user:).redact!(
      regions: [{ page_number: 1, x: 0, y: 0, width: 612, height: 792 }], base_version_id: document.current_version_id
    )
    document.reload.current_version.file.open do |file|
      output = HexaPDF::Document.open(file.path)
      assert_equal ["public.value"], output.acro_form.each_field.select(&:terminal_field?).map(&:full_field_name)
      assert_equal "PUBLIC-REFERENCE", output.acro_form.field_by_name("public.value")[:V]
      assert_empty output.pages[0].each_annotation.to_a
      assert_equal ["public.txt"], output.files.each.map(&:path)
      assert_equal ["public.txt"], output.catalog[:AF].map { |spec| output.deref(spec).path }
      assert_empty output.catalog[:Names][:JavaScript].each_entry.to_a
      assert_nil output.catalog[:StructTreeRoot]
      refute output.catalog[:MarkInfo][:Marked]
      object_values = output.each.map { |object| object.value.inspect }.join
      assert_not_includes object_values, "SECRET-ACCOUNT-123"
    end
    assert_no_recoverable_secret(document.current_version.file)
    assert_no_recoverable_secret(document.current_version.edit_layer.background)
  ensure
    source&.close!
  end

  test "replacement redaction removes original content and writes replacement text" do
    source, document, user = create_redaction_document("replace")

    PdfDocuments::Processor.new(document:, user:).redact!(
      regions: [{
        page_number: 1,
        x: 0,
        y: 0,
        width: 612,
        height: 792,
        redaction_mode: "replace",
        replacement_text: "PUBLIC-REFERENCE",
        replacement_color: "#111827",
        font_size: 18
      }],
      base_version_id: document.current_version_id
    )

    text = extracted_text(document)
    assert_not_includes text, "SECRET-ACCOUNT-123"
    assert_includes text, "PUBLIC-REFERENCE"
  ensure
    source&.close!
  end

  test "strikethrough draws a visible line through the selected area" do
    source, document, user = create_redaction_document("strike")

    PdfDocuments::Processor.new(document:, user:).redact!(
      regions: [{
        page_number: 1,
        x: 50,
        y: 100,
        width: 500,
        height: 40,
        redaction_mode: "strike",
        replacement_color: "#dc2626",
        stroke_width: 4
      }],
      base_version_id: document.current_version_id
    )

    red, green, blue = rendered_pixel(document, x: 300, y: 120)
    assert_operator red, :>, 150
    assert_operator green, :<, 100
    assert_operator blue, :<, 100
  ensure
    source&.close!
  end

  test "replacement redaction validates its style and text" do
    source, document, user = create_redaction_document("validation")
    processor = PdfDocuments::Processor.new(document:, user:)
    common = { page_number: 1, x: 20, y: 20, width: 100, height: 40 }

    error = assert_raises(ArgumentError) do
      processor.redact!(
        regions: [common.merge(redaction_mode: "replace", replacement_text: "")],
        base_version_id: document.current_version_id
      )
    end
    assert_equal "Replacement text is required.", error.message

    error = assert_raises(ArgumentError) do
      processor.redact!(
        regions: [common.merge(redaction_mode: "blur")],
        base_version_id: document.current_version_id
      )
    end
    assert_equal "Unsupported redaction style.", error.message
  ensure
    source&.close!
  end

  private

  def decoded_streams(attachment)
    attachment.open do |file|
      document = HexaPDF::Document.open(file.path)
      document.each.filter_map do |object|
        next unless object.respond_to?(:stream) && object.stream
        stream = object.stream
        # Prawn emits text as hexadecimal TJ strings; inspect every stream,
        # including content that is no longer reachable from the page tree.
        hexadecimal = stream.scan(/<([0-9a-f]+)>/i).flatten.map { |hex| [hex].pack("H*") }.join
        stream + hexadecimal
      end.join("\n")
    end
  end

  def assert_no_recoverable_secret(attachment)
    assert_not_includes decoded_streams(attachment), "SECRET-ACCOUNT-123"
    attachment.open do |file|
      values = HexaPDF::Document.open(file.path).each.map { |object| object.value.inspect }.join
      assert_not_includes values, "SECRET-ACCOUNT-123"
    end
  end

  def create_redaction_document(suffix)
    workspace = Workspace.create!(name: "Redaction #{suffix}", slug: "redaction-#{suffix}", kind: "private")
    user = create_test_user(workspace:, email: "redaction-#{suffix}@example.test")
    Current.user = user
    Current.workspace = workspace
    source = create_test_pdf(text: "SECRET-ACCOUNT-123", pages: 1)
    document = PdfDocuments::Manager.create_from_path!(
      user:,
      path: source.path,
      filename: "secret.pdf"
    )
    [source, document, user]
  end

  def extracted_text(document)
    document.reload.current_version.file.open do |file|
      text, = Open3.capture2("pdftotext", file.path, "-")
      return text
    end
  end

  def rendered_pixel(document, x:, y:)
    document.reload.current_version.file.open do |file|
      Dir.mktmpdir("pdf-redaction-test") do |directory|
        prefix = File.join(directory, "page")
        _output, error, status = Open3.capture3(
          "pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-png", "-r", "72", file.path, prefix
        )
        assert status.success?, error
        return MiniMagick::Image.open("#{prefix}.png").get_pixels.fetch(y).fetch(x)
      end
    end
  end

  def assert_color_near(actual, expected, tolerance: 8)
    expected.zip(actual).each do |expected_channel, actual_channel|
      assert_in_delta expected_channel, actual_channel, tolerance
    end
  end
end
