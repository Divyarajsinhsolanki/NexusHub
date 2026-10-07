require "tempfile"

module PdfDocuments
  class Manager
    class QuotaExceeded < StandardError; end
    class StaleVersion < StandardError; end

    def self.create_from_upload!(user:, upload:, title: nil)
      raise ArgumentError, "Choose a PDF file" unless upload.respond_to?(:original_filename)
      raise ArgumentError, "PDF must be 50MB or smaller" if upload.size.to_i > PdfDocument::MAX_UPLOAD_SIZE

      with_uploaded_pdf(upload) do |path|
        create_from_path!(
          user:,
          path:,
          filename: upload.original_filename,
          title: title.presence
        )
      end
    end

    def self.create_from_path!(user:, path:, filename:, title: nil, operation: "upload", edit_state: nil, operation_record: nil)
      publish_documents!(user:, outputs: [{ path:, filename:, title:, edit_state: }], operation:, operation_record:).first
    end

    def self.publish_documents!(user:, outputs:, operation:, operation_record: nil)
      prepared = []
      outputs.each do |output|
        inspection = Inspector.call(output.fetch(:path))
        prepared << output.merge(inspection:, blob: upload_pdf!(output.fetch(:path), sanitize_filename(output.fetch(:filename))))
      end
      documents = PdfDocument.transaction do
        operation_record&.lock!
        if operation_record&.status == "completed"
          ids = operation_record.result["document_ids"] || [operation_record.result["document_id"]]
          next user.pdf_documents.where(id: ids).to_a
        end
        lock_quota_scope!(user)
        ensure_document_slot!(user, additional: prepared.length)
        bytes = prepared.sum { |output| output[:inspection].byte_size } + extra_state_bytes(prepared.map { |output| output[:edit_state] })
        ensure_storage!(user, bytes)
        created = prepared.map do |output|
          filename = sanitize_filename(output.fetch(:filename))
          inspection = output.fetch(:inspection)
          document = user.pdf_documents.create!(workspace: user.workspace, title: output[:title].presence || File.basename(filename, ".pdf"),
            original_filename: filename, page_count: inspection.page_count, encrypted: inspection.encrypted)
          layer = attach_edit_state!(document, output[:edit_state])
          version = attach_version!(document:, created_by: user, blob: output.fetch(:blob), operation:, version_number: 1,
            parent_version: nil, inspection:, edit_layer: layer, metadata: state_metadata(output[:edit_state]))
          document.update!(current_version: version)
          document
        end
        result = created.length == 1 ? { document_id: created.first.id, version_id: created.first.current_version_id } : { document_ids: created.map(&:id) }
        complete_operation!(operation_record, result)
        created
      end
      documents.each { |document| refresh_document_derivatives!(document) }
      documents
    ensure
      Array(prepared).each { |output| purge_unattached!(output[:blob]) }
    end

    def self.append_version!(document:, created_by:, path:, operation:, base_version_id:, metadata: {}, edit_state: nil, operation_record: nil, result_metadata: {})
      inspection = Inspector.call(path)
      blob = upload_pdf!(path, document.original_filename)
      version = nil

      PdfDocument.transaction do
        operation_record&.lock!
        if operation_record&.status == "completed"
          version = document.versions.find(operation_record.result.fetch("version_id"))
          next
        end
        lock_quota_scope!(created_by)
        document.lock!
        raise StaleVersion, "Document changed in another request. Reload and try again." unless document.current_version_id == base_version_id.to_i

        redo_versions = document.versions.where("version_number > ?", document.current_version.version_number)
        next_number = document.current_version.version_number + 1
        prune_candidates = document.versions
          .where.not(version_number: 1)
          .where.not(id: redo_versions.select(:id))
          .reorder(version_number: :desc)
          .offset(PdfDocument::MAX_EDIT_VERSIONS - 1)
        # Measure the actual retained blobs after pruning. The transaction
        # restores history and attachments if the quota check rejects this edit.
        discarded_ids = redo_versions.pluck(:id) + prune_candidates.pluck(:id)
        document.versions.where(id: discarded_ids).destroy_all
        prune_edit_layers!(document)
        ensure_storage!(created_by, inspection.byte_size + extra_state_bytes([edit_state]))
        edit_layer = attach_edit_state!(document, edit_state)

        version = attach_version!(
          document:,
          created_by:,
          blob:,
          operation:,
          version_number: next_number,
          parent_version: document.current_version,
          inspection:,
          metadata: metadata.merge(state_metadata(edit_state)),
          edit_layer:
        )
        document.update!(
          current_version: version,
          page_count: inspection.page_count,
          encrypted: inspection.encrypted
        )
        prune_old_versions!(document)
        prune_edit_layers!(document)
        complete_operation!(operation_record, { document_id: document.id, version_id: version.id }.merge(result_metadata))
      end
      refresh_document_derivatives!(document)
      version
    ensure
      purge_unattached!(blob)
    end

    def self.move_history!(document:, target_version:)
      document.with_lock do
        raise ArgumentError, "Version does not belong to this document" unless target_version.pdf_document_id == document.id

        document.update!(
          current_version: target_version,
          page_count: target_version.page_count,
          encrypted: target_version.encrypted
        )
      end
      refresh_document_derivatives!(document)
      target_version
    end

    def self.user_usage(user)
      workspace = user.workspace
      {
        document_count: PdfDocument.document_count_for_workspace(workspace),
        document_limit: PdfDocument.document_limit_for(user),
        storage_bytes: PdfDocument.storage_bytes_for_workspace(workspace),
        storage_limit_bytes: PdfDocument.storage_limit_for(user)
      }
    end

    def self.refresh_thumbnail!(document)
      if document.encrypted? || document.current_version.blank?
        document.with_lock { document.thumbnail.purge if document.encrypted? && document.thumbnail.attached? }
        return
      end

      version = document.current_version
      version.file.open do |source|
        Dir.mktmpdir("pdf-thumbnail") do |directory|
          prefix = File.join(directory, "thumbnail")
          success = system("pdftoppm", "-cropbox", "-f", "1", "-singlefile", "-scale-to", "360", "-png",
                           source.path, prefix, out: File::NULL, err: File::NULL)
          image_path = "#{prefix}.png"
          return unless success && File.file?(image_path)

          document.with_lock do
            return unless document.current_version_id == version.id
            File.open(image_path, "rb") do |io|
              blob = ActiveStorage::Blob.create_and_upload!(io:, filename: "#{File.basename(document.original_filename, ".pdf")}.png", content_type: "image/png")
              document.thumbnail.attach(blob)
            end
          end
        end
      end
    rescue StandardError => e
      Rails.logger.warn("[PDF] Thumbnail generation failed for document #{document.id}: #{e.class}")
    end

    def self.refresh_searchable_text!(document)
      version = document.current_version
      scope = PdfDocument.where(id: document.id, current_version_id: version&.id)
      if document.encrypted? || document.current_version.blank?
        scope.update_all(searchable_text: nil, text_indexed_at: nil, text_index_error: "encrypted")
        return
      end

      version.file.open do |source|
        text = TextExtractor.call(
          source.path,
          max_bytes: TextExtractor::MAX_INDEX_BYTES,
          truncate: true
        )
        scope.update_all(searchable_text: text, text_indexed_at: Time.current, text_index_error: nil)
      end
    rescue StandardError => e
      scope&.update_all(searchable_text: nil, text_indexed_at: Time.current, text_index_error: e.message.to_s.first(500))
      Rails.logger.warn("[PDF] Text indexing failed for document #{document.id}: #{e.class}")
    end

    def self.refresh_document_derivatives!(document)
      document.reload
      refresh_thumbnail!(document)
      refresh_searchable_text!(document)
    end

    def self.ensure_document_slot!(user, additional: 1)
      limit = PdfDocument.document_limit_for(user)
      return if limit.blank?
      return if PdfDocument.document_count_for_workspace(user.workspace) + additional <= limit

      raise QuotaExceeded, "Workspace PDF library is limited to #{limit} documents."
    end

    def self.ensure_storage!(user, additional_bytes, reclaim_bytes: 0)
      limit = PdfDocument.storage_limit_for(user)
      return if limit.blank?

      projected = PdfDocument.storage_bytes_for_workspace(user.workspace) - reclaim_bytes.to_i + additional_bytes.to_i
      return if projected <= limit

      raise QuotaExceeded, "Workspace PDF storage is limited to #{ActiveSupport::NumberHelper.number_to_human_size(limit)}."
    end

    def self.sanitize_filename(filename)
      base = File.basename(filename.to_s).gsub(/[^0-9A-Za-z. _-]/, "")
      base = "document.pdf" if base.blank?
      base = "#{base}.pdf" unless base.downcase.end_with?(".pdf")
      base.first(255)
    end

    def self.with_uploaded_pdf(upload)
      Tempfile.create(["pdf-upload-", ".pdf"], binmode: true) do |tempfile|
        upload.rewind if upload.respond_to?(:rewind)
        IO.copy_stream(upload, tempfile)
        tempfile.flush
        yield tempfile.path
      ensure
        upload.rewind if upload.respond_to?(:rewind)
      end
    end

    def self.attach_version!(document:, created_by:, blob:, operation:, version_number:,
                             parent_version:, inspection:, metadata: {}, edit_layer: nil)
      version = document.versions.create!(
        workspace: document.workspace,
        created_by:,
        parent_version:,
        version_number:,
        operation:,
        page_count: inspection.page_count,
        encrypted: inspection.encrypted,
        byte_size: inspection.byte_size,
        metadata:,
        edit_layer:
      )
      version.file.attach(blob)
      version
    rescue StandardError
      version&.destroy
      raise
    end

    def self.prune_old_versions!(document)
      document.versions
        .where.not(version_number: 1)
        .reorder(version_number: :desc)
        .offset(PdfDocument::MAX_EDIT_VERSIONS)
        .destroy_all
    end

    def self.lock_quota_scope!(user)
      user.workspace&.lock!
      user.lock!
    end

    def self.upload_pdf!(path, filename)
      File.open(path, "rb") { |io| ActiveStorage::Blob.create_and_upload!(io:, filename:, content_type: "application/pdf", identify: false) }
    end

    def self.purge_unattached!(blob)
      blob.purge if blob&.persisted? && !blob.attachments.exists?
    rescue ActiveRecord::RecordNotFound
      nil
    end

    def self.state_metadata(state)
      state ? { "objects" => state.fetch(:objects) } : {}
    end

    def self.extra_state_bytes(states)
      blobs = states.compact.flat_map { |state| [state[:background_blob], *Array(state[:assets])] }.compact.uniq(&:id)
      used_ids = ActiveStorage::Attachment.where(blob_id: blobs.map(&:id), record_type: %w[PdfDocumentVersion PdfDocumentEditLayer PdfDocumentOperation]).pluck(:blob_id)
      blobs.reject { |blob| used_ids.include?(blob.id) }.sum(&:byte_size)
    end

    def self.attach_edit_state!(document, state)
      return unless state
      layer = state[:layer]
      if layer
        raise ArgumentError, "Editor layer belongs to another document." unless layer.pdf_document_id == document.id
      else
        layer = document.edit_layers.create!(workspace: document.workspace, geometry: state.fetch(:geometry))
        layer.background.attach(state.fetch(:background_blob))
      end
      existing = layer.assets.pluck(:blob_id)
      Array(state[:assets]).each { |asset| layer.assets.attach(asset) unless existing.include?(asset.id) }
      layer
    end

    def self.complete_operation!(operation, result)
      operation&.update!(status: "completed", progress: 100, completed_at: Time.current, error_message: nil, result:)
    end

    def self.complete_without_change!(operation, document, base_version_id, result)
      PdfDocument.transaction do
        operation&.lock!
        next if operation&.status == "completed"
        document.lock!
        raise StaleVersion, "Document changed in another request. Reload and try again." unless document.current_version_id == base_version_id.to_i
        complete_operation!(operation, { document_id: document.id, version_id: document.current_version_id }.merge(result))
      end
      document.current_version
    end

    def self.prune_edit_layers!(document)
      document.edit_layers.where.not(id: document.versions.where.not(edit_layer_id: nil).select(:edit_layer_id)).destroy_all
      document.edit_layers.find_each do |layer|
        used = layer.versions.flat_map { |version| Array(version.metadata["objects"]).filter_map { |object| object["asset_id"] } }.uniq
        layer.assets.includes(:blob).each do |attachment|
          attachment.destroy! unless used.include?(attachment.blob.metadata["pdf_asset_id"])
        end
      end
    end

    private_class_method :with_uploaded_pdf, :attach_version!, :prune_old_versions!, :lock_quota_scope!
  end
end
