class Api::V1::AuthController < Api::V1::BaseController
  skip_before_action :authenticate_user!, only: [:login, :google, :demo, :signup, :confirm, :refresh, :logout]
  skip_before_action :enforce_demo_read_only!, only: [:login, :google, :demo, :signup, :confirm, :refresh, :logout]

  def login
    credentials = params.require(:auth).permit(:email, :password, :device_name)
    user = User.find_by(email: credentials[:email].to_s.strip.downcase)

    return invalid_credentials unless user&.valid_password?(credentials[:password].to_s)
    return render_error(code: "email_unverified", message: "Verify your email before signing in.", status: :unauthorized) unless user.confirmed?
    return render_error(code: "account_locked", message: "This account is locked.", status: :forbidden) if user.locked?

    Current.user = user
    Current.workspace = user.workspace
    session, refresh_token = MobileSession.issue_for!(user: user, device_name: credentials[:device_name])
    render_session(user, session, refresh_token)
  end

  def google
    payload = FirebaseIdTokenVerifier.call(params[:id_token])
    return render_error(code: "invalid_provider_token", message: "Google sign-in could not be verified.", status: :unauthorized) unless payload

    user = find_or_create_google_user!(payload)
    return render_error(code: "account_locked", message: "This account is locked.", status: :forbidden) if user.locked?

    Current.user = user
    Current.workspace = user.workspace
    session, refresh_token = MobileSession.issue_for!(user: user, device_name: params[:device_name])
    render_session(user, session, refresh_token)
  rescue ActiveRecord::RecordInvalid => error
    render_error(code: "provider_signup_failed", message: "The Google account could not be added.", details: error.record.errors.full_messages, status: :unprocessable_entity)
  end

  def demo
    unless PortfolioAccess.enabled? && ActiveModel::Type::Boolean.new.cast(ENV.fetch("DEMO_MODE_ENABLED", "false"))
      return render_error(code: "demo_disabled", message: "The demo workspace is not available.", status: :service_unavailable)
    end

    workspace = Workspace.find_by(kind: "demo")
    user = workspace&.users&.find_by(demo_account: true)
    return render_error(code: "demo_unavailable", message: "The demo workspace is not ready.", status: :service_unavailable) unless user

    Current.user = user
    Current.workspace = workspace
    session, refresh_token = MobileSession.issue_for!(user: user, device_name: params[:device_name])
    render_session(user, session, refresh_token)
  end

  def signup
    attributes = params.require(:auth).permit(:first_name, :last_name, :email, :password, :password_confirmation, :device_name)
    user = User.new(attributes.except(:device_name))
    workspace = Workspace.new(
      name: "#{user.first_name.presence || 'New'} Workspace",
      slug: "#{user.first_name.presence || 'workspace'}-#{SecureRandom.hex(4)}",
      kind: "private"
    )
    user.workspace = workspace
    user.skip_confirmation_notification! if user.respond_to?(:skip_confirmation_notification!)

    Workspace.transaction do
      workspace.save!
      user.save!
      user.roles = [Role.find_or_create_by!(name: "owner")]
    end
    confirmation_email_sent = send_confirmation_instructions(user)

    render_data(
      {
        user: serialize_user(user),
        confirmation_required: true,
        confirmation_email_sent: confirmation_email_sent
      },
      status: :created
    )
  rescue ActiveRecord::RecordInvalid => error
    render_error(
      code: "validation_failed",
      message: "The account could not be created.",
      details: error.record.errors.full_messages,
      status: :unprocessable_entity
    )
  end

  def confirm
    user = User.confirm_by_token(params[:confirmation_token].to_s)
    return render_error(code: "invalid_confirmation_token", message: "The confirmation link is invalid or expired.", details: user.errors.full_messages, status: :unprocessable_entity) if user.errors.any?

    user.update!(status: "active") unless user.active?
    session, refresh_token = MobileSession.issue_for!(user: user, device_name: params[:device_name])
    render_session(user, session, refresh_token)
  end

  def refresh
    raw_token = params[:refresh_token].to_s
    session = MobileSession.find_by_token(raw_token)

    return invalid_refresh_token unless session

    next_refresh_token = session.rotate!(raw_token)
    return invalid_refresh_token unless next_refresh_token

    user = session.effective_user
    if session.user.locked? || user.locked?
      session.revoke!
      return render_error(code: "account_locked", message: "This account is locked.", status: :forbidden)
    end

    Current.user = user
    Current.workspace = user.workspace
    render_session(user, session, next_refresh_token)
  end

  def logout
    MobileSession.find_by_token(params[:refresh_token].to_s)&.revoke!
    render_data({ logged_out: true })
  end

  private

  def render_session(user, session, refresh_token)
    access = MobileAccessToken.issue(session)

    render_data(
      {
        user: serialize_user(user),
        access_token: access.fetch(:token),
        refresh_token: refresh_token,
        access_token_expires_at: access.fetch(:expires_at).to_i,
        refresh_token_expires_at: session.expires_at.to_i,
        impersonating: session.impersonating?
      }
    )
  end

  def find_or_create_google_user!(payload)
    email = payload[:email].to_s.downcase
    raise ActiveRecord::RecordInvalid.new(User.new) if email.blank?

    user = User.find_or_initialize_by(email: email)
    return user unless user.new_record?

    full_name = payload[:name].to_s.strip
    first_name = payload[:given_name].presence || full_name.split.first || email.split("@").first
    last_name = payload[:family_name].presence || full_name.split.drop(1).join(" ").presence || first_name
    workspace = Workspace.new(
      name: "#{first_name} Workspace",
      slug: "#{first_name.parameterize.presence || 'workspace'}-#{SecureRandom.hex(4)}",
      kind: "private"
    )

    Workspace.transaction do
      workspace.save!
      user.assign_attributes(
        first_name: first_name,
        last_name: last_name,
        password: SecureRandom.urlsafe_base64(24),
        workspace: workspace
      )
      user.skip_confirmation!
      user.status = "active"
      user.save!
      user.roles = [Role.find_or_create_by!(name: "owner")]
    end
    user
  end

  def send_confirmation_instructions(user)
    return true if user.confirmed?

    user.send_confirmation_instructions
    true
  rescue StandardError => error
    AppEventLogger.error(
      :application_errors,
      source: "#{self.class.name}#signup",
      message: "Mobile signup confirmation email failed",
      exception: error,
      payload: { email: user.email }
    )
    Rails.error.report(error, handled: true, context: { controller: self.class.name, action: "signup_confirmation", email: user.email })
    false
  end

  def invalid_credentials
    render_error(code: "invalid_credentials", message: "Email or password is incorrect.", status: :unauthorized)
  end

  def invalid_refresh_token
    render_error(code: "invalid_refresh_token", message: "The session has expired. Sign in again.", status: :unauthorized)
  end
end
