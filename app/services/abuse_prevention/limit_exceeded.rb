module AbusePrevention
  class LimitExceeded < StandardError
    attr_reader :retry_after
    def initialize(message = "Resource limit reached. Try again later.", retry_after: 60)
      @retry_after = retry_after
      super(message)
    end
  end
end
