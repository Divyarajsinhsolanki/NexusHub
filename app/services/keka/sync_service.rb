module Keka
  class SyncService
    class SyncError < StandardError; end

    def initialize(user)
      @user = user
    end

    def call
      api_key = @user.safe_keka_api_key
      validate!(api_key)

      client = Client.new(base_url: @user.keka_base_url, api_key: api_key)
      range_start = 30.days.ago.to_date
      range_end = Date.current

      payload = {
        profile: client.employee_profile(@user.keka_employee_id),
        attendance: client.attendance_logs(@user.keka_employee_id, start_date: range_start, end_date: range_end),
        timesheets: client.timesheets(@user.keka_employee_id, start_date: range_start, end_date: range_end),
        leave_balances: client.leave_balances(@user.keka_employee_id)
      }

      payload = Integrations::Redactor.call(payload, known_secrets: [api_key])
      @user.update!(keka_profile_data: payload, keka_last_synced_at: Time.current)
      payload
    rescue SyncError
      raise
    rescue StandardError => e
      raise SyncError, "Keka synchronization failed. Check the saved connection."
    end

    private

    def validate!(api_key)
      return if @user.keka_base_url.present? && api_key.present? && @user.keka_employee_id.present?

      raise SyncError, "Keka credentials are missing or can no longer be decrypted. Please save them again."
    end
  end
end
