module ReleaseSecurity
  class Identity
    def self.sha
      file = Rails.root.join('.release-revision')
      value = file.file? ? file.read(128).strip : ENV['APP_REVISION'].to_s
      value.match?(/\A[0-9a-f]{40}\z/) ? value : nil
    end
  end
end
