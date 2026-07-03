require "open3"
require "timeout"

module PdfDocuments
  class TextExtractor
    MAX_ARTIFACT_BYTES = 10.megabytes
    MAX_INDEX_BYTES = 1.megabyte

    def self.call(path, max_bytes:, truncate: false, timeout: 90)
      stdout, stderr, status = Timeout.timeout(timeout) do
        Open3.capture3("pdftotext", "-layout", "-enc", "UTF-8", path, "-")
      end
      raise ArgumentError, "Text extraction failed." unless status.success?

      text = stdout.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
      return text if text.bytesize <= max_bytes
      raise ArgumentError, "Extracted text is too large." unless truncate

      text.byteslice(0, max_bytes).to_s.force_encoding("UTF-8").scrub
    rescue Timeout::Error
      raise ArgumentError, "PDF operation timed out. Try a smaller document."
    rescue Errno::ENOENT
      raise ArgumentError, "pdftotext is not available."
    end
  end
end
