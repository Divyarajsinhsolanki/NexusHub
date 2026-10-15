require "json"
require "rbconfig"
require "tempfile"

module PdfDocuments
  # The web/queue process coordinates publication; parsing runs in a separate,
  # disposable process with CPU, memory, file, output and wall-clock limits.
  # This trusted worker needs DB/storage access. Inspector uses a second, much
  # narrower networkless sandbox with no Rails credentials.
  class Execution
    def self.enabled?
      !Rails.env.test? || ENV["PDF_TEST_ISOLATED_EXECUTION"] == "1"
    end

    def self.upload(user:, upload:, title: nil)
      return Manager.create_from_upload!(user:, upload:, title:) unless enabled?
      raise ArgumentError, "Choose a PDF file" unless upload.respond_to?(:tempfile)
      raise ArgumentError, "PDF must be 50MB or smaller" if upload.size > PdfDocument::MAX_UPLOAD_SIZE
      result = AbusePrevention::PdfExecutionSlots.with_capacity(user) do
        invoke("upload", { user_id: user.id, upload: upload_descriptor(upload), title: })
      end
      user.pdf_documents.find(result.fetch("document_id"))
    end

    def self.operation(operation, password: nil, asset: nil, assets: {}, defer_when_busy: false)
      return OperationRunner.new(operation).run!(password:, asset:, assets:) unless enabled?
      execution_token = SecureRandom.uuid
      AbusePrevention::PdfExecutionSlots.with_capacity(operation.user) do
        invoke("operation", { operation_id: operation.id, execution_token:, password:, asset: upload_descriptor(asset),
          assets: assets.transform_values { |file| upload_descriptor(file) } })
      end
      operation.reload.result
    rescue StandardError => error
      raise if defer_when_busy && error.is_a?(AbusePrevention::LimitExceeded)
      operation.reload.with_lock do
        held_token = operation.parameters.dig(PdfDocumentOperation::PROCESSING_LEASE_KEY, "token")
        if operation.status == "queued" || (execution_token && operation.status == "processing" && held_token == execution_token)
          operation.update!(status: "failed", progress: 100, completed_at: Time.current,
            error_message: error.is_a?(ArgumentError) ? error.message.first(500) : "PDF processing stopped or exceeded its resource limits.")
        end
      end
      Sources.release!(operation)
      if error.is_a?(Timeout::Error) || error.is_a?(Command::OutputLimitExceeded)
        raise ArgumentError, "PDF processing exceeded its resource limits. Try a smaller document."
      end
      raise
    end

    def self.upload_descriptor(upload)
      return nil unless upload
      raise ArgumentError, "Invalid image upload" unless upload.respond_to?(:tempfile)
      { path: upload.tempfile.path, filename: upload.original_filename, content_type: upload.content_type }
    end

    def self.invoke(action, arguments)
      Dir.mktmpdir("pdf-execution-") do |workdir|
        Tempfile.create("result-", workdir) do |result_file|
          payload = JSON.generate(action:, arguments:, result_path: result_file.path)
          _, _, status = Command.capture3(
            [RbConfig.ruby, Rails.root.join("script/pdf_execution.rb").to_s],
            timeout: 300, max_output_bytes: 256 * 1024, input_data: payload,
            environment: ENV.to_h.merge("PDF_EXECUTION_CHILD" => "1", "RAILS_LOG_TO_STDOUT" => "false", "TMPDIR" => workdir))
          result = JSON.parse(File.read(result_file.path, 64 * 1024))
          unless status.success? && result["ok"]
            error = result["error"].to_s
            case result["type"]
            when "stale" then raise Manager::StaleVersion, error
            when "quota" then raise Manager::QuotaExceeded, error
            else raise ArgumentError, error.presence || "PDF processing failed."
            end
          end
          result.fetch("result")
        end
      end
    rescue JSON::ParserError, KeyError
      raise ArgumentError, "PDF processing stopped unexpectedly. Try a smaller document."
    rescue Timeout::Error
      raise ArgumentError, "PDF processing timed out. Try a smaller document." if action == "upload"
      raise
    end
  end
end
