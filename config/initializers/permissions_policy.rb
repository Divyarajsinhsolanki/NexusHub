# Rails currently emits the older Feature-Policy syntax from its policy DSL.
# Send the modern header explicitly; calls remain enabled on our own origin.
Rails.application.config.action_dispatch.default_headers["Permissions-Policy"] =
  "camera=(self), microphone=(self), geolocation=(), usb=(), payment=()"
