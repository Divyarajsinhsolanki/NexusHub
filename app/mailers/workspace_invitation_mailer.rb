class WorkspaceInvitationMailer < ApplicationMailer
  def invitation(id, encrypted_token)
    invitation = WorkspaceInvitation.unscoped.find(id)
    raw = WorkspaceInvitation.decrypt_token(encrypted_token)
    return unless invitation.token_valid?(raw)
    options = Rails.application.config.action_mailer.default_url_options.symbolize_keys
    host = options.fetch(:host)
    base = host.match?(%r{\Ahttps?://}) ? host : "#{options[:protocol] || 'https'}://#{host}#{options[:port] ? ":#{options[:port]}" : ''}"
    uri = URI.parse(base)
    raise "Invalid invitation base URL" unless uri.host.present? && %w[https http].include?(uri.scheme) && (!Rails.env.production? || uri.scheme == "https")
    link = "#{base.delete_suffix('/')}/invitations/accept#token=#{raw}"
    mail(to: invitation.email, subject: "Invitation to #{invitation.workspace.name}") do |format|
      format.text { render plain: "You have been invited to #{invitation.workspace.name} with these roles: #{invitation.role_names.join(', ')}.\n\nAccept your invitation: #{link}\n\nThis link expires in seven days and can be used once. You choose your password; your company never needs it. If you already have an account here, enter your existing password. If you did not expect this invitation, ignore it." }
    end
  end
end
