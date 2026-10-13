class AccountDeletionSweepJob < ApplicationJob
  queue_as :default

  def perform
    AccountDeletionRequest.due.find_each { |request| AccountDeletionJob.perform_later(request.id) }
  end
end
