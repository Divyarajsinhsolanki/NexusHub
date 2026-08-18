class PushNotificationSettings
  CATEGORIES = %w[chat audio_calls video_calls work social reminders].freeze
  DEFAULTS = {
    "enabled" => true,
    "previews" => true,
    "categories" => CATEGORIES.index_with { true },
    "quiet_hours" => {
      "enabled" => false,
      "start" => "22:00",
      "end" => "07:00",
      "timezone" => "UTC",
      "allow_calls" => true
    }
  }.freeze

  class << self
    def normalize(value)
      input = value.respond_to?(:to_h) ? value.to_h.deep_stringify_keys : {}
      quiet = input.fetch("quiet_hours", {}).to_h.stringify_keys
      categories = input.fetch("categories", {}).to_h.stringify_keys.slice(*CATEGORIES)

      DEFAULTS.deep_merge(
        "enabled" => boolean(input.fetch("enabled", DEFAULTS["enabled"])),
        "previews" => boolean(input.fetch("previews", DEFAULTS["previews"])),
        "categories" => categories.transform_values { |enabled| boolean(enabled) },
        "quiet_hours" => {
          "enabled" => boolean(quiet.fetch("enabled", DEFAULTS.dig("quiet_hours", "enabled"))),
          "start" => valid_time(quiet["start"]) || DEFAULTS.dig("quiet_hours", "start"),
          "end" => valid_time(quiet["end"]) || DEFAULTS.dig("quiet_hours", "end"),
          "timezone" => valid_timezone(quiet["timezone"]) || DEFAULTS.dig("quiet_hours", "timezone"),
          "allow_calls" => boolean(quiet.fetch("allow_calls", DEFAULTS.dig("quiet_hours", "allow_calls")))
        }
      )
    end

    def quiet_period(value, now: Time.current)
      settings = normalize(value)
      quiet = settings.fetch("quiet_hours")
      return unless quiet["enabled"]

      zone = Time.find_zone(quiet["timezone"]) || Time.zone
      local_now = now.in_time_zone(zone)
      start_minutes = minutes(quiet["start"])
      end_minutes = minutes(quiet["end"])
      return if start_minutes == end_minutes

      current_minutes = local_now.hour * 60 + local_now.min
      if start_minutes < end_minutes
        return unless current_minutes >= start_minutes && current_minutes < end_minutes

        start_at = local_now.change(hour: start_minutes / 60, min: start_minutes % 60, sec: 0)
        end_at = local_now.change(hour: end_minutes / 60, min: end_minutes % 60, sec: 0)
      elsif current_minutes >= start_minutes
        start_at = local_now.change(hour: start_minutes / 60, min: start_minutes % 60, sec: 0)
        end_at = (local_now + 1.day).change(hour: end_minutes / 60, min: end_minutes % 60, sec: 0)
      elsif current_minutes < end_minutes
        start_at = (local_now - 1.day).change(hour: start_minutes / 60, min: start_minutes % 60, sec: 0)
        end_at = local_now.change(hour: end_minutes / 60, min: end_minutes % 60, sec: 0)
      end

      { starts_at: start_at, ends_at: end_at } if start_at && end_at
    end

    private

    def boolean(value)
      ActiveModel::Type::Boolean.new.cast(value)
    end

    def valid_time(value)
      candidate = value.to_s
      candidate if candidate.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/)
    end

    def valid_timezone(value)
      candidate = value.to_s
      candidate if candidate.present? && Time.find_zone(candidate)
    end

    def minutes(value)
      hour, minute = value.split(":").map(&:to_i)
      hour * 60 + minute
    end
  end
end
