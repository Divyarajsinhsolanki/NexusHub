Rails.application.config.after_initialize do
  if Rails.env.production?
    ReleaseSecurity::KeyPolicy.verify!([Rails.application.secret_key_base, Devise.secret_key, ENV['DEVISE_JWT_SECRET_KEY']])
  end
end
