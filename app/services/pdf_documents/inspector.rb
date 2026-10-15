require "json"
require "rbconfig"

module PdfDocuments
  class Inspector
    Result = Data.define(:page_count, :encrypted, :byte_size)

    def self.call(path, password: nil)
      raise ArgumentError, "PDF file was not created" unless File.file?(path)
      size = File.size(path)
      raise ArgumentError, "PDF file is empty" if size.zero?
      raise ArgumentError, "PDF must be 50MB or smaller" if size > PdfDocument::MAX_UPLOAD_SIZE
      File.open(path, "rb") { |file| raise ArgumentError, "File does not have a valid PDF header" unless file.read(4) == "%PDF" }
      output, _, status = Command.capture3(
        [RbConfig.ruby, Rails.root.join("script/pdf_inspect.rb").to_s, File.expand_path(path)],
        timeout: 30, max_output_bytes: 8192, input_data: JSON.generate(password:), sandbox: true)
      result = JSON.parse(output)
      raise ArgumentError, result["error"] || "PDF inspection failed" unless status.success?
      Result.new(page_count: result.fetch("page_count"), encrypted: result.fetch("encrypted"), byte_size: size)
    rescue Timeout::Error
      raise ArgumentError, "PDF inspection timed out. Try a smaller document."
    rescue JSON::ParserError, KeyError
      raise ArgumentError, "PDF inspection failed in the isolated parser."
    end
  end
end
