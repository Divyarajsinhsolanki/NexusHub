Rails.application.config.action_dispatch.default_headers.merge!(
  "X-Content-Type-Options" => "nosniff",
  "X-Frame-Options" => "SAMEORIGIN",
  "X-XSS-Protection" => "0",
  "Referrer-Policy" => "strict-origin-when-cross-origin",
  # Firebase OAuth popups need to communicate with their opener.
  "Cross-Origin-Opener-Policy" => "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy" => "same-origin"
)
Rails.application.config.action_controller.forgery_protection_origin_check = true
Rails.application.config.session_store :cookie_store, key: "_rails_vite_session", httponly: true,
  secure: Rails.env.production?, same_site: :lax
