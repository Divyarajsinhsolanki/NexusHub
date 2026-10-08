module OperationScheduleValidation
  extend ActiveSupport::Concern

  included do
    validates :name, :time_zone, presence: true
    validates :name, length: { maximum: 200 }
    validate :valid_operation_schedule
  end

  private

  def valid_operation_schedule
    errors.add(:project_environment, 'must belong to this project') if project_environment&.project_id != project_id
    # Membership can change during execution. Keep historical assignments usable
    # for completion/verification, while rejecting newly assigned inactive users.
    if new_record? || will_save_change_to_project_id? || will_save_change_to_owner_id?
      errors.add(:owner, 'must be an active project member') unless owner && active_member_ids.include?(owner_id)
    end
    begin
      TZInfo::Timezone.get(time_zone.to_s)
    rescue TZInfo::InvalidTimezoneIdentifier
      errors.add(:time_zone, 'must be an IANA timezone')
    end
    recipients_valid = recipient_ids.is_a?(Array) && recipient_ids.size <= 100 && recipient_ids.all? { |id| id.is_a?(Integer) }
    if recipients_valid && (new_record? || will_save_change_to_project_id? || will_save_change_to_recipient_ids?)
      recipients_valid = (recipient_ids - active_member_ids).empty?
    end
    unless recipients_valid
      errors.add(:recipient_ids, 'must contain active project members')
    end
    unless reminder_minutes.is_a?(Array) && reminder_minutes.size <= 10 && reminder_minutes.all? { |n| n.is_a?(Integer) && n.between?(1, 525_600) }
      errors.add(:reminder_minutes, 'must contain at most 10 positive minute offsets')
    end
    return errors.add(:targets, 'must be a list') unless targets.is_a?(Array)
    ids = targets.filter_map { |target| target.is_a?(Hash) && target['item_id']&.to_s }
    valid = targets.size <= 1_000 && ids.size == targets.size && ids.uniq.size == ids.size && targets.all? do |target|
      target['expected_version'].is_a?(String) && target['expected_version'].present? && target['expected_version'].length <= 160 &&
        ProjectOperationItem.where(project_id: project_id, kind: 'software', id: target['item_id']).exists?
    end
    errors.add(:targets, 'must reference unique software items in this project with expected versions') unless valid
  end

  def active_member_ids
    return [] unless project
    project.project_users.where(status: 'active').joins(:user).where(users: { status: 'active' }).pluck(:user_id)
  end
end
