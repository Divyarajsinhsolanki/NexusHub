module PdfDocuments
  class Serializer
    include Rails.application.routes.url_helpers

    def initialize(document, context:, include_editor: true)
      @document = document
      @context = context
      @include_editor = include_editor
    end

    def as_json(*)
      current = @document.current_version
      data = {
        id: @document.id,
        title: @document.title,
        original_filename: @document.original_filename,
        page_count: @document.page_count,
        encrypted: @document.encrypted,
        byte_size: current&.byte_size.to_i,
        storage_bytes: @document.storage_bytes,
        current_version_id: current&.id,
        current_version_number: current&.version_number,
        can_undo: @document.undo_version.present?,
        can_redo: @document.redo_version.present?,
        content_url: current ? @context.content_api_pdf_document_path(@document) : nil,
        download_url: current ? @context.download_api_pdf_document_path(@document) : nil,
        thumbnail_url: thumbnail_url,
        created_at: @document.created_at,
        updated_at: @document.updated_at
      }
      if @include_editor
        data[:editor_state] = editor_state
        data[:recent_operations] = @document.operations.order(created_at: :desc).limit(20).map do |operation|
          OperationSerializer.new(operation, context: @context, include_document: false).as_json
        end
      end
      data
    end

    private

    def editor_state
      version = @document.current_version
      empty = { layer_id: nil, background_url: nil, objects: [], assets: {}, page_sizes: {} }
      return empty unless version && !version.encrypted?
      layer = version.edit_layer
      return empty.merge(layer_id: "version-#{version.id}", background_url: @context.content_api_pdf_document_path(@document)) unless layer
      asset_urls = layer.asset_map.transform_values do |attachment|
        @context.editor_asset_api_pdf_document_path(@document, layer_id: layer.id, asset_id: attachment.blob.metadata["pdf_asset_id"])
      end
      objects = Array(version.metadata["objects"]).map do |object|
        public_object = Editor.display_object(object, layer.geometry)
        public_object["asset_url"] = asset_urls[public_object["asset_id"]] if public_object["asset_id"]
        public_object
      end
      sizes = layer.geometry.map.with_index(1) do |geometry, index|
        page = PageGeometry.new(**geometry.symbolize_keys)
        [index.to_s, page.display_size.merge(rotation: page.rotation)]
      end.to_h
      { layer_id: layer.id, background_url: @context.editor_background_api_pdf_document_path(@document, layer_id: layer.id),
        objects:, assets: asset_urls, page_sizes: sizes }
    end

    def thumbnail_url
      return unless @document.thumbnail.attached?

      @context.rails_blob_path(@document.thumbnail, only_path: true)
    end
  end
end
