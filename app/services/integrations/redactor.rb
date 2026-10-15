module Integrations
  class Redactor
    SENSITIVE = /passw|secret|token|private.?key|api.?key|authorization|credential|webhook/i
    def self.call(value, known_secrets: [])
      case value
      when Hash
        value.to_h { |key, item| [key, key.to_s.match?(SENSITIVE) ? "[FILTERED]" : call(item, known_secrets:)] }
      when Array then value.map { |item| call(item, known_secrets:) }
      when String
        known_secrets.reject(&:blank?).reduce(value.dup) { |text, secret| text.gsub(secret, "[FILTERED]") }
      else value
      end
    end
  end
end
