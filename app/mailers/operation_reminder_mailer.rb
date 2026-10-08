class OperationReminderMailer < ApplicationMailer
  def reminder(delivery)
    @source = delivery.source
    @recipient = delivery.recipient
    @kind = @source.is_a?(ProjectDeployment) ? 'Deployment' : 'Licence expiry'
    @date = if @source.is_a?(ProjectDeployment)
      @source.scheduled_at.in_time_zone(@source.time_zone).strftime('%b %-d, %Y %H:%M %Z')
    else
      "#{@source.details['expiry_date']} (#{@source.details['time_zone']})"
    end
    options = Rails.application.routes.default_url_options.merge(Rails.application.config.action_mailer.default_url_options || {})
    protocol = (options[:protocol].presence || 'http').delete_suffix('://')
    host = options[:host].presence || 'localhost'
    port = options[:port].present? && !host.include?(':') ? ":#{options[:port]}" : ''
    @url = "#{protocol}://#{host}#{port}#{Operations::Schedules.path_for(@source)}"
    headers['Message-ID'] = "<operations-reminder-#{delivery.id}@#{options[:host].to_s.split(':').first.presence || 'localhost'}>"
    mail(to: @recipient.email, subject: "#{@kind}: #{@source.name}")
  end
end
