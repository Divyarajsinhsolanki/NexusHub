module SessionCookieAuthentication
  extend ActiveSupport::Concern

  private

  def set_jwt_cookie!(user, web_session: nil)
    web_session ||= WebSession.issue_for!(user)
    access_token = web_session.token(type: "web_access", expires_at: 15.minutes.from_now)
    refresh_token = web_session.token(type: "web_refresh", expires_at: web_session.expires_at)

    cookies.signed[:access_token] = {
      value: access_token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :strict,
      expires: 15.minutes.from_now
    }

    cookies.signed[:refresh_token] = {
      value: refresh_token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: web_session.expires_at
    }
  end

  def clear_jwt_cookies!
    WebSession.authenticate(cookies.signed[:refresh_token], type: "web_refresh")&.revoke!
    WebSession.authenticate(cookies.signed[:access_token], type: "web_access")&.revoke!
    cookies.delete(:access_token, httponly: true)
    cookies.delete(:refresh_token, httponly: true)
  end

  def authentication_user_payload(user)
    profile_picture_url = rails_blob_url(user.profile_picture, only_path: true) if user.profile_picture.attached?
    cover_photo_url = rails_blob_url(user.cover_photo, only_path: true) if user.cover_photo.attached?

    user.public_json(include_roles: true).symbolize_keys.merge(
      profile_picture: profile_picture_url,
      cover_photo: cover_photo_url,
      avatar_color: user.avatar_color,
      landing_page: user.demo_account? ? "demo" : user.landing_page,
      phone_number: user.phone_number,
      bio: user.bio,
      social_links: user.social_links || {},
      demo_account: user.demo_account?,
      site_admin: user.site_admin?,
      workspace: {
        id: user.workspace_id,
        name: user.workspace.name,
        slug: user.workspace.slug,
        kind: user.workspace.kind,
        saas: user.workspace.saas_plan
      }
    )
  end
end
