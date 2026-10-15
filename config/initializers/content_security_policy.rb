require Rails.root.join("lib/browser_security")

# Actual browser integrations; arbitrary external scripts/connections are denied.
feed_origins = %w[
  https://api.nasa.gov https://www.bing.com https://api.wordnik.com https://owlbot.info
  https://api.datamuse.com https://api.dictionaryapi.dev https://financialmodelingprep.com
  https://www.alphavantage.co https://api.spaceflightnewsapi.net https://api.rss2json.com
  https://content.guardianapis.com https://inshorts.vercel.app https://hn.algolia.com
  https://newsapi.org https://newsdata.io https://gnews.io https://uselessfacts.jsph.pl
  https://opentdb.com https://api.quotable.io https://quotes.rest https://zenquotes.io https://byabbe.se
]
auth_domain = ENV["VITE_FIREBASE_AUTH_DOMAIN"].presence
firebase_origin = auth_domain && BrowserSecurity.origins("https://#{auth_domain}").first
livekit_url = ENV["LIVEKIT_URL"].presence || Rails.application.credentials.dig(:livekit, :url)
livekit_origins = []
if livekit_url.present?
  uri = URI.parse(livekit_url)
  raise "LIVEKIT_URL must use wss in production" if Rails.env.production? && uri.scheme != "wss"
  raise "Invalid LIVEKIT_URL origin" unless %w[ws wss].include?(uri.scheme) && uri.host && !uri.userinfo
  origin = "#{uri.scheme}://#{uri.host}#{uri.port == uri.default_port ? '' : ":#{uri.port}"}"
  livekit_origins = [origin, origin.sub(/\Aws/, 'http')]
end
extra_connect = BrowserSecurity.origins(ENV["CSP_CONNECT_ORIGINS"])
dev_sources = Rails.env.development? ? %w[http://localhost:3036 http://127.0.0.1:3036 ws://localhost:3036 ws://127.0.0.1:3036] : []
Rails.application.config.content_security_policy do |policy|
  policy.default_src :self
  policy.base_uri :self
  policy.object_src :none
  policy.frame_ancestors :self
  policy.form_action :self
  # Firebase popup auth loads the Google API bootstrap and its follow-up scripts.
  policy.script_src :self, "https://apis.google.com", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/", *dev_sources.select { |source| source.start_with?('http') }
  # React, Headless UI, motion, charts and PDF presentation use inline styles.
  policy.style_src :self, :unsafe_inline, "https://fonts.googleapis.com", *dev_sources.select { |source| source.start_with?('http') }
  policy.font_src :self, :data, "https://fonts.gstatic.com"
  policy.img_src :self, :data, :blob, :https
  policy.media_src :self, :blob, :https
  policy.worker_src :self, :blob
  policy.frame_src :self, "https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/", *Array(firebase_origin)
  policy.connect_src :self, :blob, "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com",
    "https://www.googleapis.com", "https://www.google.com/recaptcha/", "https://res.cloudinary.com", "https://api.cloudinary.com",
    *Array(firebase_origin), *feed_origins, *livekit_origins, *extra_connect, *dev_sources,
    -> { (respond_to?(:request) ? request : self).base_url.sub(/\Ahttp/, 'ws') }
  policy.upgrade_insecure_requests true if Rails.env.production?
end
Rails.application.config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(24) }
Rails.application.config.content_security_policy_nonce_directives = %w[script-src]
