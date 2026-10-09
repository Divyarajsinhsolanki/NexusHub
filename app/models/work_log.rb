class WorkLog < ApplicationRecord
  include UserStampable
  include WorkspaceScoped

  belongs_to :user, inverse_of: :work_logs
  belongs_to :category, class_name: 'WorkCategory', optional: true, inverse_of: :work_logs
  belongs_to :priority, class_name: 'WorkPriority', optional: true, inverse_of: :work_logs

  has_many :work_log_tags, dependent: :destroy, inverse_of: :work_log
  has_many :tags, through: :work_log_tags, source: :work_tag, class_name: 'WorkTag'

  validates :title, :log_date, :start_time, :end_time, presence: true
  validate :end_time_after_start_time

  def planned_minutes
    return 0 unless start_time && end_time

    (((end_time - start_time) % 1.day) / 60.0).round
  end

  def save_with_tags!(attributes)
    attributes = attributes.to_h.symbolize_keys
    self.class.transaction do
      assign_attributes(attributes.except(:tags))
      save!
      if attributes.key?(:tags)
        names = Array(attributes[:tags]).filter_map { |name| name.to_s.strip.presence }.uniq
        self.tags = names.map { |name| WorkTag.find_or_create_by!(name: name) }
      end
    end
  end

  private

  def end_time_after_start_time
    return if end_time.blank? || start_time.blank?

    # An earlier end clock time means the work finishes on the following day.
    if end_time == start_time
      errors.add(:end_time, "must differ from start time")
    end
  end
end
