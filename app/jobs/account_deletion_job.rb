class AccountDeletionJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 5

  def perform(request_id)
    request = AccountDeletionRequest.includes(:user).find_by(id: request_id)
    return unless request&.status == 'scheduled'
    Accounts::Lifecycle.new(request.user).finalize!
  end
end
