class Api::PrivacyRequestManagementController < Api::BaseController
  before_action :operator_only!

  def index
    scope = PrivacyRequest.all
    scope = PrivacyRequest::STATUSES.include?(params[:status]) ? scope.where(status: params[:status]) : scope.where.not(status: PrivacyRequest::CLOSED)
    records = scope.order(target_response_at: :asc, id: :asc).limit(100)
    render json: records.map { |record| record.public_payload.merge(identity_verified_at: record.identity_verified_at,
      details: record.payload.except('response'), lock_version: record.lock_version) }
  end

  def update
    record = PrivacyRequest.find_by!(reference: params[:id])
    input = params.require(:privacy_request).permit(:status, :response, :operator_note, :identity_verified, :target_response_at, :lock_version)
    record.with_lock do
      raise ArgumentError, 'Verify the email address before processing this request.' unless record.email_verified_at && !record.redacted_at
      raise ActiveRecord::StaleObjectError.new(record, 'update') unless input[:lock_version].to_s == record.lock_version.to_s
      status = input[:status].to_s
      raise ArgumentError, 'Select a valid processing status.' unless (PrivacyRequest::STATUSES - ['pending_verification', 'received']).include?(status)
      raise ArgumentError, 'Closed requests cannot be edited.' if PrivacyRequest::CLOSED.include?(record.status)
      payload = record.payload
      note = input[:operator_note].to_s.strip
      response_text = input[:response].to_s.strip
      raise ArgumentError, 'Response and notes must each be at most 4,000 characters.' if [note, response_text].any? { |value| value.length > 4000 }
      raise ArgumentError, 'Record the review or verification basis in an internal note.' if note.blank?
      verified = record.identity_verified_at || (ActiveModel::Type::Boolean.new.cast(input[:identity_verified]) && Time.current)
      raise ArgumentError, 'Record identity/authority verification before completing.' if status == 'completed' && !verified
      if (PrivacyRequest::CLOSED + ['needs_information']).include?(status) && response_text.blank?
        raise ArgumentError, 'Provide an explanation or next steps for the requester.'
      end
      target = input[:target_response_at].present? ? Time.iso8601(input[:target_response_at]) : record.target_response_at
      payload.merge!('response' => response_text, 'operator_note' => note)
      record.payload = payload
      record.update!(status:, identity_verified_at: verified || nil, target_response_at: target,
        closed_at: PrivacyRequest::CLOSED.include?(status) ? Time.current : nil)
      record.privacy_request_events.create!(actor: current_user, action: 'operator_updated', status:)
    end
    notification_queued = false
    if record.payload['response'].present?
      begin
        notification_queued = !!PrivacyRequestMailer.status_changed(record.id).deliver_later
      rescue StandardError
        AppEventLogger.warn(:application_errors, source: self.class.name, message: 'Privacy response notification could not be queued', payload: { privacy_reference: record.reference })
      end
    end
    render json: record.public_payload.merge(lock_version: record.lock_version, notification_queued:)
  rescue ArgumentError => error
    render json: { error: error.message }, status: :unprocessable_entity
  end

  private

  def operator_only!
    raise Project::Forbidden, 'Only the site privacy operator can access this queue.' unless current_user.site_admin? && !current_user.demo_account?
    require_recent_mfa!
  end
end
