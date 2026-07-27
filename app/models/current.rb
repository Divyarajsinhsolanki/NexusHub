class Current < ActiveSupport::CurrentAttributes
  attribute :user, :workspace, :request_id, :suppress_realtime_broadcasts

  class << self
    def reset_all
      reset
    end

    def request_id
      instance.request_id
    end

    def request_id=(value)
      instance.request_id = value
    end
  end

  def request_id
    attributes[:request_id]
  end

  def request_id=(value)
    attributes[:request_id] = value
  end
end
