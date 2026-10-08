module Operations
  class Recurrence
    # Choose the earlier UTC offset for repeated wall times. For skipped wall
    # times, retain minutes and advance by the daylight-saving transition gap.
    def self.local_time(date, time, zone_name)
      zone = TZInfo::Timezone.get(zone_name)
      hour, minute = time.split(':').map(&:to_i)
      local = Time.utc(date.year, date.month, date.day, hour, minute)
      periods = zone.periods_for_local(local)
      if periods.empty?
        transition = zone.transitions_up_to(local + 2.days, local - 2.days).find do |entry|
          before = entry.at.to_time + entry.previous_offset.utc_total_offset
          after = entry.at.to_time + entry.offset.utc_total_offset
          before <= local && local < after
        end
        raise ArgumentError, 'Unable to resolve local schedule time' unless transition
        local += transition.offset.utc_total_offset - transition.previous_offset.utc_total_offset
        periods = zone.periods_for_local(local)
      end
      (local - periods.max_by(&:utc_total_offset).utc_total_offset).utc
    end

    def self.occurrences(series, now: Time.current, horizon: 90.days)
      zone = TZInfo::Timezone.get(series.time_zone)
      today = zone.to_local(now).to_date
      first = [series.starts_on, today].max
      last = [zone.to_local(now + horizon).to_date, series.ends_on].compact.min
      return [] if last < first
      (first..last).filter_map do |date|
        matches = series.frequency == 'weekly' ? series.weekdays.include?(date.wday) : date.day == series.day_of_month
        next unless matches
        timestamp = local_time(date, series.local_time, series.time_zone)
        [date.iso8601, timestamp] if timestamp >= now
      end
    end
  end
end
