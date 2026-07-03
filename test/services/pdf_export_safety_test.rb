require "test_helper"
require "zlib"

class PdfExportSafetyTest < ActiveSupport::TestCase
  setup do
    @workspace = Workspace.create!(name: "PDF Export Safety", slug: "pdf-export-safety", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "pdf-export@example.test")
    Current.user = @user
    Current.workspace = @workspace
  end

  test "sorts exported page images numerically" do
    paths = %w[/tmp/page-1.png /tmp/page-10.png /tmp/page-2.png /tmp/page-3.png]

    assert_equal(
      %w[/tmp/page-1.png /tmp/page-2.png /tmp/page-3.png /tmp/page-10.png],
      PdfDocuments::Processor.sorted_page_image_paths(paths)
    )
  end

  test "rejects image export above page cap before rendering" do
    document = @user.pdf_documents.create!(
      workspace: @workspace,
      title: "Too large",
      original_filename: "too-large.pdf",
      page_count: PdfDocuments::Processor::MAX_IMAGE_EXPORT_PAGES + 1
    )

    error = assert_raises(ArgumentError) do
      PdfDocuments::Processor.new(document:, user: @user).export_images!
    end
    assert_equal "Image export is limited to 100 pages.", error.message
  end

  test "image edits do not write generated PDFs through public uploads" do
    source = create_test_pdf(pages: 1)
    image = create_test_png
    document = PdfDocuments::Manager.create_from_path!(
      user: @user,
      path: source.path,
      filename: "private-stamp.pdf"
    )
    asset = Struct.new(:path, :size, :content_type).new(image.path, File.size(image.path), "image/png")
    before = Dir.glob(Rails.root.join("public/uploads/*")).sort

    PdfDocuments::Processor.new(document:, user: @user).edit!(
      kind: "image",
      parameters: { page_number: 1, x: 10, y: 10, width: 80, height: 40 },
      base_version_id: document.current_version_id,
      asset:
    )

    assert_equal before, Dir.glob(Rails.root.join("public/uploads/*")).sort
  ensure
    source&.close!
    image&.close!
  end

  private

  def create_test_png(width: 10, height: 10)
    file = Tempfile.new(["pdf-test-image-", ".png"], binmode: true)
    raw_pixels = Array.new(height) { "\x00".b + ("\xff\x00\x00".b * width) }.join
    png = "\x89PNG\r\n\x1a\n".b
    png << png_chunk("IHDR".b, [width, height, 8, 2, 0, 0, 0].pack("NNCCCCC"))
    png << png_chunk("IDAT".b, Zlib::Deflate.deflate(raw_pixels))
    png << png_chunk("IEND".b, "".b)
    file.write(png)
    file.flush
    file
  end

  def png_chunk(type, data)
    [data.bytesize].pack("N") + type + data + [Zlib.crc32(type + data)].pack("N")
  end
end
