# Enforce low-risk directives now. A script/connect allowlist needs a separate
# browser audit of Firebase, reCAPTCHA, LiveKit, PDF workers and third-party feeds.
Rails.application.config.content_security_policy do |policy|
  policy.base_uri :self
  policy.object_src :none
  policy.frame_ancestors :self
end
