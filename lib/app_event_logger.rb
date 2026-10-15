require 'json'

class AppEventLogger
  class << self
    def info(channel, source:, message:, payload: {})
      write(channel, :info, source: source, message: message, payload: payload)
    end

    def warn(channel, source:, message:, payload: {})
      write(channel, :warn, source: source, message: message, payload: payload)
    end

    def error(channel, source:, message:, exception: nil, payload: {})
      error_payload = sanitize_hash(payload).merge(exception_payload(exception))
      write(channel, :error, source: source, message: message, payload: error_payload)
      write(:application_errors, :error, source: source, message: message, payload: error_payload) unless channel.to_sym == :application_errors
      Rails.logger.error("[#{source}] #{message} #{error_payload.to_json}")
    end

    private

    def write(channel, level, source:, message:, payload: {})
      entry = {
        time: Time.current.iso8601(3),
        severity: level.to_s.upcase,
        source: source,
        message: message,
        request_id: Current.request_id,
        user_id: Current.user&.id
      }.merge(sanitize_hash(payload)).compact

      AppLoggers.fetch(channel).public_send(level, entry.to_json)
    rescue StandardError => e
      Rails.logger.error("[AppEventLogger] Failed to write #{channel} log: #{e.class}")
    end

    def exception_payload(exception)
      return {} unless exception

      {
        error_class: exception.class.name,
        error_message: "[REDACTED]",
        backtrace: Array(exception.backtrace).first(15)
      }
    end

    def sanitize_hash(payload)
      return {} if payload.blank?

      source = payload.is_a?(ActionController::Parameters) ? payload.to_unsafe_h : payload
      source = { value: source } unless source.is_a?(Hash)
      ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters + [:row, :rows]).filter(sanitize_value(source))
    end

    def sanitize_value(value)
      case value
      when ActionController::Parameters
        sanitize_value(value.to_unsafe_h)
      when Hash
        value.each_with_object({}) do |(key, item), sanitized|
          sanitized[key] = sanitize_value(item) unless item.nil?
        end
      when Array
        value.first(20).map { |item| sanitize_value(item) }
      when Date, Time, DateTime, ActiveSupport::TimeWithZone
        value.iso8601
      when ActiveRecord::Base
        { model: value.class.name, id: value.id }
      else
        sanitize_scalar(value)
      end
    end

    def sanitize_scalar(value)
      return value if value.is_a?(Numeric) || value == true || value == false

      if value.is_a?(ActionDispatch::Http::UploadedFile)
        return {
          original_filename: value.original_filename,
          content_type: value.content_type,
          size: value.size
        }
      end

      string = value.to_s
      string.length > 500 ? "#{string.first(500)}..." : string
    end
  end
end
