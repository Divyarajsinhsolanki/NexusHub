module PdfDocuments
  # Rasterizing a page is not enough when catalog entries still refer to its
  # form values, attachments, actions, or tagged alternate text.
  class PageSanitizer
    def self.finalize!(document, page_numbers)
      finalized, preserved = document.pages.each_with_index.partition { |_, index| page_numbers.include?(index + 1) }
      finalized, preserved = finalized.map(&:first), preserved.map(&:first)
      removed_annotations = finalized.flat_map { |page| page.each_annotation.to_a }
      kept_annotations = preserved.flat_map { |page| page.each_annotation.to_a }
      removed_files = file_specs(document, finalized, removed_annotations) - file_specs(document, preserved, kept_annotations)
      removed_actions = actions(document, removed_annotations) - actions(document, kept_annotations)

      if (form = document.acro_form)
        form.each_field.to_a.select(&:terminal_field?).each do |field|
          widgets = field.each_widget.to_a
          removed = widgets & removed_annotations
          next if removed.empty? && widgets.any?
          if widgets.empty? || removed.length == widgets.length
            parent = field[:Parent]
            form.delete_field(field)
            while parent && Array(parent[:Kids]).empty?
              ancestor = parent[:Parent]
              form.delete_field(parent)
              parent = ancestor
            end
          else
            removed.each { |widget| field.delete_widget(widget) }
          end
        end
      end

      remove_names!(document, :EmbeddedFiles, removed_files)
      if document.catalog[:AF]
        document.catalog[:AF] = Array(document.catalog[:AF]).map { |spec| document.deref(spec) }
          .reject { |spec| removed_files.include?(spec) }
      end
      remove_names!(document, :JavaScript, removed_actions)
      document.catalog.delete(:OpenAction) if removed_actions.include?(document.deref(document.catalog[:OpenAction]))
      if document.catalog[:AA]
        additional = document.deref(document.catalog[:AA])
        additional = additional.value if additional.respond_to?(:value)
        document.catalog[:AA] = additional.reject { |_, action| removed_actions.include?(document.deref(action)) }
      end

      # Structural alternate text can retain the original page's words even
      # after its content streams disappear. Retagging rasterized pages would
      # require rebuilding this tree; omit it from the sanitized document.
      document.catalog.delete(:StructTreeRoot)
      document.catalog[:MarkInfo][:Marked] = false if document.catalog[:MarkInfo]
      document.pages.each { |page| page.delete(:StructParents) }
    end

    def self.file_specs(document, pages, annotations)
      (pages.flat_map { |page| Array(page[:AF]) } + annotations.filter_map { |annotation| annotation[:FS] })
        .map { |spec| document.deref(spec) }.compact.uniq
    end

    def self.actions(document, annotations)
      pending = annotations.flat_map do |annotation|
        additional = document.deref(annotation[:AA])
        additional = additional.value if additional.respond_to?(:value)
        [annotation[:A], *Array(additional&.values)]
      end.compact
      collected = []
      until pending.empty?
        action = document.deref(pending.shift)
        next unless action && !collected.include?(action) && action.respond_to?(:[]) &&
          !(action.respond_to?(:null?) && action.null?)
        collected << action
        following = document.deref(action[:Next])
        pending.concat(following.is_a?(Array) || following.is_a?(HexaPDF::PDFArray) ? Array(following) : [following].compact)
      end
      collected
    end

    def self.remove_names!(document, name, removed)
      tree = document.catalog[:Names] && document.catalog[:Names][name]
      tree&.each_entry&.to_a&.each { |key, value| tree.delete_entry(key) if removed.include?(document.deref(value)) }
    end
    private_class_method :file_specs, :actions, :remove_names!
  end
end
