require "csv"

module Operations
  class Imports
    MAX_BYTES = 1_048_576
    MAX_ROWS = 1_000
    VERSION_HEADERS = %w[name observed_version expected_version observed_at ecosystem].freeze

    def initialize(project:, actor:)
      @project, @actor = project, actor
    end

    def preview(format:, environment_id:, content:, version_destination: "observed")
      Policy.new(project, actor).authorize_edit!
      records = parse(format, content, version_destination)
      project.with_lock do
        Policy.new(project, actor).authorize_edit!
        environment = project.project_environments.find(environment_id)
        {
          revision: project.operations_revision, format: normalized_format(format), version_destination: version_destination, environment_id: environment.id,
          rows: records.map do |record|
            item = find_item(record)
            {
              name: record[:name], kind: record[:kind], exists: item.present?,
              configured: record[:kind] == "configuration" ? record[:value].present? : record[:"#{version_destination}_version"].present?,
              secret: item ? item.secret? : record[:kind] == "configuration", action: item ? "update" : "create"
            }.merge(record[:kind] == "software" ? record.slice(:expected_version, :observed_version, :observed_at, :ecosystem) : {})
          end
        }
      end
    end

    def commit(format:, environment_id:, content:, revision:, selected_keys:, public_keys: [], reason: nil, version_destination: "observed")
      Policy.new(project, actor).authorize_edit!
      records = parse(format, content, version_destination)
      unless selected_keys.is_a?(Array) && selected_keys.any? && selected_keys.all? { |name| name.is_a?(String) }
        raise Error, "Select at least one key to import."
      end
      raise Error, "Public keys must be a list." unless public_keys.is_a?(Array) && public_keys.all? { |name| name.is_a?(String) }
      names = records.map { |record| record[:name] }
      raise Error, "Selected keys must be present in the imported file." if (selected_keys - names).any?
      raise Error, "Public keys must be selected configuration keys." if (public_keys - selected_keys).any? || (public_keys.any? && normalized_format(format) != "env")
      selected = records.select { |record| selected_keys.include?(record[:name]) }
      mutation = Mutation.new(project: project, actor: actor, revision: revision)
      mutation.run(event: "import_committed", reason: reason) do
        environment = project.project_environments.find(environment_id)
        selected.each do |record|
          item = find_item(record)
          if item && public_keys.include?(item.name)
            raise Error, "Import can classify only new keys as public. Existing classifications are preserved."
          end
          unless item
            item = ProjectOperationItem.create!(
              project: project, workspace: project.workspace, kind: record[:kind], name: record[:name],
              secret: record[:kind] == "configuration" && !public_keys.include?(record[:name]),
              details: record[:kind] == "software" && record[:ecosystem].present? ? { ecosystem: record[:ecosystem] } : {}
            )
          end
          attrs = if record[:kind] == "configuration"
            { value: record[:value], source: "env_import" }
          elsif version_destination == "expected"
            { expected_version: record[:expected_version] }
          else
            # Observations and approved baselines are deliberately distinct destinations.
            { observed_version: record[:observed_version], observed_at: record[:observed_at], source: "version_import" }
          end
          mutation.write_entry!(item, environment, attrs)
          mutation.audit!(action: "entry_imported", item: item, environment: environment, fields: attrs.keys, metadata: { source: attrs[:source] })
        end
        { imported_count: selected.length }
      end
    end

    private

    attr_reader :project, :actor

    def normalized_format(format)
      case format.to_s
      when "env", "dotenv" then "env"
      when "versions", "csv" then "versions"
      else raise Error, "Choose an environment file or versions CSV."
      end
    end

    def find_item(record)
      ProjectOperationItem.find_by(project: project, kind: record[:kind], name: record[:name])
    end

    def parse(format, content, version_destination)
      raise Error, "Choose expected or observed versions as the import destination." unless version_destination.in?(%w[expected observed])
      raise Error, "Import content must be text." unless content.is_a?(String)
      raise Error, "Import must be 1MB or smaller." if content.bytesize > MAX_BYTES
      content = content.dup.force_encoding(Encoding::UTF_8)
      raise Error, "Import must contain valid UTF-8 text." unless content.valid_encoding?
      records = normalized_format(format) == "env" ? parse_env(content.delete_prefix("\uFEFF")) : parse_versions(content.delete_prefix("\uFEFF"), version_destination)
      raise Error, "No entries were found in the import." if records.empty?
      raise Error, "Import is limited to #{MAX_ROWS} entries." if records.length > MAX_ROWS
      seen = {}
      records.each do |record|
        raise Error, "Import contains a duplicate name on line #{record[:line]}. Keep one row per name." if seen[record[:name]]
        seen[record[:name]] = true
      end
      records
    end

    def parse_env(content)
      lines = content.lines
      records = []
      index = 0
      while index < lines.length
        number = index + 1
        line = lines[index].delete_suffix("\n").delete_suffix("\r")
        index += 1
        next if line.strip.empty? || line.lstrip.start_with?("#")
        match = line.match(/\A\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\z/)
        raise Error, "Invalid environment entry on line #{number}. Expected NAME=value." unless match
        name, raw = match.captures
        raise Error, "Environment key on line #{number} is too long." if name.length > 160
        if raw.start_with?("'", '"')
          quote = raw[0]
          closing = closing_quote(raw, quote)
          while closing.nil? && index < lines.length
            raw += "\n" + lines[index].delete_suffix("\n").delete_suffix("\r")
            index += 1
            closing = closing_quote(raw, quote)
          end
          raise Error, "Unterminated quoted value on line #{number}." unless closing
          trailing = raw[(closing + 1)..].strip
          raise Error, "Unexpected text after the quoted value on line #{number}." unless trailing.empty? || trailing.start_with?("#")
          value = raw[1...closing]
          value = value.gsub(/\\([nrt\\"])/) { { "n" => "\n", "r" => "\r", "t" => "\t", "\\" => "\\", '"' => '"' }.fetch(Regexp.last_match(1)) } if quote == '"'
        else
          value = raw.sub(/\s+#.*\z/, "").rstrip
        end
        raise Error, "Value on line #{number} is larger than 64KB." if value.bytesize > 65_536
        records << { kind: "configuration", name: name, value: value, line: number }
      end
      records
    end

    def closing_quote(raw, quote)
      escaped = false
      raw.chars.each_with_index do |character, position|
        next if position.zero?
        if escaped
          escaped = false
        elsif character == "\\" && quote == '"'
          escaped = true
        elsif character == quote
          return position
        end
      end
      nil
    end

    def parse_versions(content, version_destination)
      table = CSV.parse(content, headers: true, skip_blanks: true)
      headers = table.headers
      version_column = "#{version_destination}_version"
      unless headers.include?("name") && headers.include?(version_column) && (headers - VERSION_HEADERS).empty? && headers.uniq.length == headers.length
        raise Error, "Versions CSV requires name,#{version_column} and accepts expected_version,observed_version,observed_at,ecosystem."
      end
      table.each_with_index.map do |row, index|
        raise Error, "Versions CSV row #{index + 2} has too many columns." if row.headers.any?(&:nil?)
        name, version = row["name"].to_s.strip, row[version_column].to_s.strip
        raise Error, "Versions CSV row #{index + 2} requires a name and #{version_destination} version." if name.blank? || version.blank?
        raise Error, "Versions CSV row #{index + 2} contains a field longer than 160 characters." if row.fields.any? { |value| value.to_s.length > 160 }
        observed_at = row["observed_at"].to_s.strip.presence
        if observed_at
          begin
            raise ArgumentError unless observed_at.match?(/(?:Z|[+-]\d\d:\d\d)\z/)
            timestamp = Time.iso8601(observed_at)
            raise ArgumentError if timestamp > 1.minute.from_now
          rescue ArgumentError
            raise Error, "Versions CSV row #{index + 2} requires a valid observed timestamp that is not in the future."
          end
        end
        { kind: "software", name: name, observed_version: row["observed_version"].to_s.strip.presence, expected_version: row["expected_version"].to_s.strip.presence, observed_at: observed_at, ecosystem: row["ecosystem"].to_s.strip.presence, line: index + 2 }
      end
    rescue CSV::MalformedCSVError
      raise Error, "Versions CSV is malformed. Check its columns and quoting."
    end
  end
end
