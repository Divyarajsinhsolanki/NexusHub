require 'digest'

module Operations
  class Schedules
    class << self
      def snapshot(project)
        {
          deployments: ProjectDeployment.where(project: project).includes(:owner, :project_environment).order(scheduled_at: :desc).map(&:as_operations_json),
          series: ProjectDeploymentSeries.where(project: project).order(created_at: :desc).as_json(except: %i[workspace_id created_at updated_at])
        }
      end

      def path_for(source)
        section = source.is_a?(ProjectDeployment) ? 'deployments' : 'licenses'
        "/projects/#{source.project_id}/dashboard?tab=environments&section=#{section}&record=#{source.id}"
      end

      def sync_item!(item, actor: nil)
        sync_license!(item) if item.kind == 'license'
      end

      def cleanup_item!(item, actor: nil)
        cleanup_license!(item) if item.kind == 'license'
      end

      def cleanup_license!(item)
        OperationReminderDelivery.where(source: item).where.not(state: 'sent').update_all(state: 'cancelled', updated_at: Time.current)
        CalendarEvent.where(operation_source: item).destroy_all
      end

      def sync_license!(item)
        details = item.details
        if details['expiry_date'].blank?
          cleanup_license!(item)
          return
        end
        date = Date.iso8601(details['expiry_date'])
        zone = details.fetch('time_zone')
        start_at = Recurrence.local_time(date, '09:00', zone)
        end_at = Recurrence.local_time(date + 1.day, '00:00', zone)
        owner = User.find(details.fetch('owner_id'))
        calendar!(item, owner: owner, title: "Licence expiry: #{item.name}", start_at: start_at, end_at: end_at,
          status: Time.current >= end_at ? 'completed' : 'scheduled')
        times = details.fetch('reminder_days', [30, 7, 1]).uniq.map { |offset| Recurrence.local_time(date - offset.days, '09:00', zone) }
        reconcile!(item, recipients: [owner.id, *details.fetch('recipient_ids', [])], times: times)
      end

      def sync_deployment!(deployment)
        calendar_status = case deployment.status
        when 'cancelled', 'failed' then 'cancelled'
        when 'deployed' then 'completed'
        else 'scheduled'
        end
        calendar!(deployment, owner: deployment.owner, title: "Deployment: #{deployment.name}", start_at: deployment.scheduled_at,
          end_at: deployment.scheduled_at + 1.hour, status: calendar_status)
        times = deployment.status.in?(%w[planned in_progress]) ? deployment.reminder_minutes.uniq.map { |offset| deployment.scheduled_at - offset.minutes } : []
        reconcile!(deployment, recipients: [deployment.owner_id, *deployment.recipient_ids], times: times)
      end

      def revision_for(source)
        return source.schedule_revision.to_s if source.is_a?(ProjectDeployment)
        Digest::SHA256.hexdigest([source.name, source.details.slice('expiry_date', 'time_zone', 'owner_id', 'recipient_ids', 'reminder_days')].to_json)
      end

      def delivery_current?(delivery)
        source = delivery.source
        return false unless source && revision_for(source) == delivery.schedule_revision
        return false unless source.project_id == delivery.project_id && source.workspace_id == delivery.workspace_id
        if source.is_a?(ProjectDeployment)
          source.status.in?(%w[planned in_progress]) && source.scheduled_at >= Time.current
        else
          source.kind == 'license' && source.details['expiry_date'].present? &&
            Time.current < Recurrence.local_time(Date.iso8601(source.details['expiry_date']) + 1.day, '00:00', source.details['time_zone'])
        end
      end

      def materialize!(series, now: Time.current)
        return unless series.active?
        Recurrence.occurrences(series, now: now).each do |key, scheduled_at|
          next if series.project_deployments.exists?(occurrence_key: key)
          deployment = series.project_deployments.create!(series.attributes.slice('workspace_id', 'project_id', 'project_environment_id', 'owner_id', 'name', 'time_zone', 'recipient_ids', 'reminder_minutes', 'targets', 'notes').merge(occurrence_key: key, scheduled_at: scheduled_at))
          sync_deployment!(deployment)
        end
      end

      private

      def calendar!(source, owner:, title:, start_at:, end_at:, status:)
        event = CalendarEvent.find_or_initialize_by(operation_source: source)
        event.assign_attributes(workspace: source.workspace, project: source.project, user: owner, title: title,
          description: 'Managed in Project Environments & Operations.', start_at: start_at, end_at: end_at,
          all_day: false, event_type: 'deadline', visibility: 'project', status: status)
        event.save!
      end

      def reconcile!(source, recipients:, times:)
        revision = revision_for(source)
        scope = OperationReminderDelivery.where(source: source)
        scope.where.not(schedule_revision: revision).where.not(state: 'sent').update_all(state: 'cancelled', updated_at: Time.current)
        active_ids = source.project.project_users.where(status: 'active', user_id: recipients.map(&:to_i).uniq).pluck(:user_id)
        scope.where(schedule_revision: revision).where.not(state: 'sent').where.not(recipient_id: active_ids).update_all(state: 'cancelled', updated_at: Time.current)
        if times.empty?
          scope.where.not(state: 'sent').update_all(state: 'cancelled', updated_at: Time.current)
          return
        end
        active_ids.each do |id|
          %w[in_app email].each do |channel|
            times.each do |at|
              # Reconciliation never creates already-elapsed offsets. Existing
              # due deliveries remain eligible for worker restart recovery.
              next if at < Time.current
              delivery = scope.find_or_create_by!(schedule_revision: revision, recipient_id: id, channel: channel, send_at: at) do |delivery|
                delivery.workspace = source.workspace
                delivery.project = source.project
              end
              # Restoring an earlier licence schedule also restores its digest.
              # Its future deliveries may have been cancelled by an intervening
              # edit; reactivate those without repeating already-sent notices.
              if delivery.state == 'cancelled'
                delivery.update!(state: 'pending', claimed_at: nil, failure_class: nil)
              end
            end
          end
        end
      end
    end
  end
end
