module PdfDocuments
  class Sources
    Attachment = Struct.new(:blob) do
      def attached? = blob.present?
      def open(&block) = blob.open(&block)
      def download(&block) = blob.download(&block)
    end
    Layer = Struct.new(:id, :background, :geometry, :assets) do
      def asset_map = assets.index_by { |attachment| attachment.blob.metadata["pdf_asset_id"] }
    end
    Version = Struct.new(:id, :pdf_document, :file, :edit_layer, :metadata, :page_count, :encrypted) do
      def encrypted? = encrypted
      def pdf_document_id = pdf_document.id
    end

    def self.capture!(operation, versions)
      snapshots = []
      blobs = []
      versions.each do |version|
        layer = version.edit_layer
        file = version.file.blob
        background = layer&.background&.blob || file
        keys = Array(version.metadata["objects"]).filter_map { |object| object["asset_id"] }.uniq
        assets = layer ? layer.asset_map.slice(*keys).values.map(&:blob) : []
        blobs.concat([file, background, *assets])
        snapshots << { document_id: version.pdf_document_id, version_id: version.id, file_blob_id: file.id,
                       background_blob_id: background.id, layer_id: layer&.id, geometry: layer&.geometry,
                       objects: Array(version.metadata["objects"]), asset_blob_ids: assets.map(&:id),
                       page_count: version.page_count, encrypted: version.encrypted? }
      end
      operation.with_lock do
        operation.source_files.attach(blobs.uniq(&:id))
        operation.update!(parameters: operation.parameters.merge("_source_snapshots" => snapshots.map(&:deep_stringify_keys)))
      end
    end

    def self.resolve(operation)
      snapshots = Array(operation.parameters["_source_snapshots"])
      return [] if snapshots.empty?
      blobs = operation.source_files.includes(:blob).index_by(&:blob_id).transform_values(&:blob)
      snapshots.map do |snapshot|
        document = operation.user.pdf_documents.find(snapshot.fetch("document_id"))
        file = Attachment.new(blobs.fetch(snapshot.fetch("file_blob_id")))
        layer = if snapshot["layer_id"]
          Layer.new(snapshot["layer_id"], Attachment.new(blobs.fetch(snapshot.fetch("background_blob_id"))),
            snapshot.fetch("geometry"), snapshot.fetch("asset_blob_ids").map { |id| Attachment.new(blobs.fetch(id)) })
        end
        Version.new(snapshot.fetch("version_id"), document, file, layer, { "objects" => snapshot.fetch("objects") },
                    snapshot["page_count"], snapshot["encrypted"])
      end
    rescue KeyError, ActiveRecord::RecordNotFound
      raise ArgumentError, "Source PDF is no longer available. Reload and try again."
    end

    def self.release!(operation)
      operation.source_files.each(&:purge_later) if %w[completed failed].include?(operation.status)
    end
  end
end
