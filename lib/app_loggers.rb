require 'logger'
require 'time'

class AppLoggers
  LOG_FILES = {
    sheet_operations: 'sheet_operations.log',
    project_dashboard: 'project_dashboard.log',
    application_errors: 'application_errors.log',
    request_audit: 'request_audit.log'
  }.freeze

  class << self
    def fetch(channel)
      loggers[channel.to_sym] ||= build_logger(channel.to_sym)
    end

    private

    def loggers
      @loggers ||= {}
    end

    def build_logger(channel)
      filename = LOG_FILES.fetch(channel) { "#{channel}.log" }
      logger = ActiveSupport::Logger.new(Rails.root.join('log', filename), 10, 10 * 1024 * 1024)
      logger.level = Logger::INFO
      logger.formatter = proc do |severity, datetime, _progname, message|
        "#{datetime.utc.iso8601(3)} #{severity} #{message}\n"
      end
      logger
    end
  end
end
