require 'net/http'
require 'uri'
require 'open-uri'

class Api::AuthController < Api::BaseController
  include Rails.application.routes.url_helpers
  skip_before_action :authenticate_user!, only: [:login, :signup, :refresh]
  skip_before_action :enforce_demo_read_only!, only: [:login, :signup, :refresh, :logout]

  def signup
    user = User.new(user_params)
    workspace = Workspace.new(
      name: "#{user.first_name.presence || 'New'} Workspace",
      slug: "#{user.first_name.presence || 'workspace'}-#{SecureRandom.hex(4)}",
      kind: "private"
    )
    user.workspace = workspace
    if params.dig(:auth, :profile_picture).present? && params.dig(:auth, :profile_picture) != "null"
      user.profile_picture = params[:auth][:profile_picture]
    end
    if params.dig(:auth, :cover_photo).present? && params.dig(:auth, :cover_photo) != "null"
      user.cover_photo = params[:auth][:cover_photo]
    end

    if save_signup_user(workspace, user)
      confirmation_email_sent = send_confirmation_instructions(user)
      render json: {
        message: signup_message(confirmation_email_sent),
        confirmation_email_sent: confirmation_email_sent,
        user: authentication_user_payload(user)
      }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def login
    user = nil

    if params[:id_token] # firebase_token = request.headers["Authorization"]&.split(" ")&.last.presence
      payload = verify_firebase_token(params[:id_token])  # (firebase_token)
      return render json: { error: "Invalid token" }, status: :unauthorized unless payload

      user = User.find_or_initialize_by(email: payload["email"])

      if user.new_record?
        full_name = payload["name"].to_s.strip
        first_name = payload["given_name"].presence || full_name.split.first || user.email.split("@").first
        last_name = payload["family_name"].presence || full_name.split.drop(1).join(" ")

        user.first_name = first_name
        user.last_name = last_name.presence || first_name
        user.password = SecureRandom.hex(10)
        user.landing_page ||= User::LANDING_PAGES.first
        user.workspace = build_personal_workspace(first_name)
        user.skip_confirmation! if user.respond_to?(:skip_confirmation!)
      end

      if payload["picture"].present? && !user.profile_picture.attached?
        user.profile_picture.attach(
          io: URI.open(payload["picture"]),
          filename: "#{payload["email"]}_profile_picture.jpg",
          content_type: "image/jpeg"
        )
      end

      save_google_user!(user) if user.changed? || user.new_record?
    else
      user = User.find_by(email: params[:auth][:email])
      return render json: { error: "Invalid credentials" }, status: :unauthorized unless user&.valid_password?(params[:auth][:password])
      return render json: { error: "Email not verified" }, status: :unauthorized unless user.confirmed?
    end

    return render json: { error: "Account locked" }, status: :unauthorized if user.locked?

    Current.workspace = user.workspace
    set_jwt_cookie!(user)
    render json: {
      message: "Login successful",
      user: authentication_user_payload(user),
      exp: 15.minutes.from_now.to_i
    }
  end

  def refresh
    refresh_token = cookies.signed[:refresh_token]
    payload = JwtService.decode(refresh_token)

    if payload && (user = User.find_by(id: payload["user_id"]))
      Current.workspace = user.workspace
      set_jwt_cookie!(user)
      render json: {
        user: authentication_user_payload(user),
        exp: 15.minutes.from_now.to_i
      }
    else
      render json: { error: "Unauthorized" }, status: :unauthorized
    end
  end

  def session_info
    render json: {
      user: authentication_user_payload(current_user),
      exp: access_cookie_exp
    }
  end

  def logout
    clear_jwt_cookies!
    render json: { message: "Logged out successfully" }
  end

  def view_profile
    profile_picture_url = rails_blob_url(current_user.profile_picture, only_path: true) if current_user&.profile_picture&.attached?
    cover_photo_url = rails_blob_url(current_user.cover_photo, only_path: true) if current_user&.cover_photo&.attached?
    teams = current_user.team_users.includes(:team).map do |tu|
      {
        id: tu.team_id,
        name: tu.team.name,
        role: tu.role,
        status: tu.status
      }
    end
    projects = current_user.project_users.includes(project: { project_users: :user }).map do |pu|
      project = pu.project
      {
        id: project.id,
        name: project.name,
        description: project.description,
        end_date: project.end_date,
        role: pu.role,
        status: pu.status,
        members: project.project_users.map do |member|
          {
            id: member.user_id,
            name: [member.user.first_name, member.user.last_name].compact.join(' '),
            profile_picture: member.user.profile_picture.attached? ?
              rails_blob_url(member.user.profile_picture, only_path: true) : nil,
            avatar_color: member.user.avatar_color
          }
        end
      }
    end
    render json: {
      user: current_user.public_json(include_roles: true)
                      .merge(
                        "profile_picture" => profile_picture_url,
                        "cover_photo" => cover_photo_url
                      ),
      teams: teams,
      projects: projects,
      keka: current_user.keka_payload
    }
  end

  def update_profile
    current_user.update(user_params)

    if current_user.errors.any?
      render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
      return
    end

    if params.dig(:auth, :profile_picture).present? && params.dig(:auth, :profile_picture) != "null"
      current_user.profile_picture = params[:auth][:profile_picture]
    end
    if params.dig(:auth, :cover_photo).present? && params.dig(:auth, :cover_photo) != "null"
      current_user.cover_photo = params[:auth][:cover_photo]
    end

    render json: { message: "User details updated successfully" }
  end

  private

  def user_params
    permitted = params.require(:auth).permit(
      :first_name,
      :last_name,
      :date_of_birth,
      :email,
      :password,
      :uid,
      :profile_picture,
      :cover_photo,
      :color_theme,
      :avatar_color,
      :dark_mode,
      :landing_page,
      :phone_number,
      :bio,
      social_links: {},
      notification_preferences: {}
    )
    permitted.delete(:profile_picture) if permitted[:profile_picture] == "null"
    permitted.delete(:cover_photo) if permitted[:cover_photo] == "null"
    permitted
  end

  def save_signup_user(workspace, user)
    user.skip_confirmation_notification! if user.respond_to?(:skip_confirmation_notification!)

    Workspace.transaction do
      workspace.save!
      user.save!
      user.roles = [Role.find_or_create_by!(name: "owner")]
    end
    true
  rescue ActiveRecord::RecordInvalid
    false
  end

  def send_confirmation_instructions(user)
    return true if user.confirmed?

    user.send_confirmation_instructions
    true
  rescue StandardError => error
    AppEventLogger.error(
      :application_errors,
      source: "#{self.class.name}#signup",
      message: "Signup confirmation email failed",
      exception: error,
      payload: { email: user.email }
    )
    Rails.error.report(error, handled: true, context: { controller: self.class.name, action: "signup_confirmation", email: user.email })
    false
  end

  def signup_message(confirmation_email_sent)
    return "User created successfully. Please check your email to verify your account." if confirmation_email_sent

    "User created successfully, but the confirmation email could not be sent. Please contact support to verify your account."
  end

  def build_personal_workspace(first_name)
    Workspace.new(
      name: "#{first_name.presence || 'Personal'} Workspace",
      slug: "#{first_name.presence || 'workspace'}-#{SecureRandom.hex(4)}",
      kind: "private"
    )
  end

  def save_google_user!(user)
    was_new_record = user.new_record?

    Workspace.transaction do
      user.workspace.save! if user.workspace&.new_record?
      user.save!
      user.roles = [Role.find_or_create_by!(name: "owner")] if was_new_record
    end
  end

  def verify_firebase_token(token)
    FirebaseIdTokenVerifier.call(token)
  rescue => e
    Rails.logger.error("Firebase token error: #{e}")
    nil
  end

  def access_cookie_exp
    payload = JwtService.decode(cookies.signed[:access_token])
    return if payload.blank? || payload[:error].present?

    payload[:exp]
  end

end
