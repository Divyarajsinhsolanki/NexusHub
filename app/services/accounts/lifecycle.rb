require 'digest'
require 'securerandom'

module Accounts
  class Lifecycle
    class InvalidRequest < StandardError; end
    GRACE_PERIOD = 7.days
    RETENTION = 'After seven days, personal profile data, private content and uploads are removed and access is revoked. Shared history keeps an anonymous user reference. Backups, logs and storage versions follow infrastructure retention settings and are not erased immediately. Workspace subscriptions and shared projects remain with their owners.'.freeze

    def initialize(user)
      @user = user
    end

    def status
      request = AccountDeletionRequest.find_by(user: user)
      {
        status: request&.status || 'none', delete_after: request&.delete_after,
        receipt_id: request&.receipt_id, completed_at: request&.completed_at,
        failure_reason: request&.failure_reason, retention: RETENTION,
        needs_transfer: ownership?, can_delete: !user.demo_account? && !user.deleted_at?,
        successors: user.workspace.users.where(status: 'active', deleted_at: nil, demo_account: false).where.not(id: user.id)
          .order(:first_name).map { |candidate| { id: candidate.id, name: candidate.full_name } }
      }
    end

    def send_code!
      raise InvalidRequest, 'Demo accounts cannot be deleted.' if user.demo_account?
      user.with_lock do
        request = AccountDeletionRequest.find_or_initialize_by(user: user)
        raise InvalidRequest, 'Deletion is already scheduled. Cancel it before requesting another code.' if request.status == 'scheduled'
        raise InvalidRequest, 'Wait one minute before requesting another code.' if request.code_sent_at && request.code_sent_at > 1.minute.ago
        code = SecureRandom.random_number(1_000_000).to_s.rjust(6, '0')
        request.assign_attributes(status: 'verification_pending', verification_digest: digest(code),
          verification_expires_at: 15.minutes.from_now, verification_attempts: 0,
          code_sent_at: Time.current, receipt_id: SecureRandom.uuid, delete_after: nil, failure_reason: nil)
        request.save!
        key = Rails.application.key_generator.generate_key('account-deletion-code', 32)
        encrypted_code = ActiveSupport::MessageEncryptor.new(key).encrypt_and_sign(code)
        AccountLifecycleMailer.verification(user, encrypted_code).deliver_later
      end
      status
    end

    def schedule!(code:, successor_id:, confirmation:)
      raise InvalidRequest, 'Type DELETE to confirm.' unless confirmation == 'DELETE'
      error = nil
      user.with_lock do
        request = AccountDeletionRequest.find_by!(user: user)
        raise InvalidRequest, 'Request a new verification code.' unless request.status == 'verification_pending' && request.verification_expires_at&.future? && request.verification_attempts < 5
        if !ActiveSupport::SecurityUtils.secure_compare(request.verification_digest.to_s, digest(code.to_s))
          request.increment!(:verification_attempts)
          error = 'Incorrect verification code.'
        else
          # A valid email code verifies the destructive operation, including transfers.
          transfer!(successor_id) if ownership?
          request.update!(status: 'scheduled', delete_after: GRACE_PERIOD.from_now,
            verification_digest: nil, verification_expires_at: nil, failure_reason: nil)
          AccountDeletionJob.set(wait_until: request.delete_after).perform_later(request.id)
        end
      end
      raise InvalidRequest, error if error
      status
    end

    def cancel!
      user.with_lock do
        request = AccountDeletionRequest.find_by!(user: user)
        raise InvalidRequest, 'Completed deletion cannot be cancelled.' if request.status == 'completed' || user.deleted_at?
        request.update!(status: 'cancelled', delete_after: nil, verification_digest: nil, verification_expires_at: nil, failure_reason: nil)
      end
      status
    end

    def finalize!
      Current.set(workspace: user.workspace, user: nil) do
        user.with_lock do
          request = AccountDeletionRequest.lock.find_by!(user: user)
          return unless request.status == 'scheduled' && request.delete_after <= Time.current
          if ownership?
            request.update!(status: 'blocked', failure_reason: 'You acquired new ownership. Transfer it and verify a new deletion request.')
            return
          end
          personal_cleanup!
          user.update_columns(deleted_attributes.merge(deleted_at: Time.current, updated_at: Time.current))
          request.update!(status: 'completed', completed_at: Time.current, verification_digest: nil, failure_reason: nil)
        end
      end
    end

    private

    attr_reader :user

    def digest(code)
      Digest::SHA256.hexdigest("#{user.id}:#{user.email.downcase}:#{code}:#{Rails.application.secret_key_base}")
    end

    def ownership?
      user.owner? || user.site_admin? || Project.unscoped.where(owner_id: user.id).exists? ||
        Team.unscoped.where(owner_id: user.id).exists? || Department.unscoped.where(manager_id: user.id).exists? ||
        ProjectDeployment.unscoped.where(owner_id: user.id).exists? || ProjectDeploymentSeries.unscoped.where(owner_id: user.id).exists? ||
        ProjectOperationItem.unscoped.where("details ->> 'owner_id' = ?", user.id.to_s).exists? ||
        Conversation.unscoped.where(creator_id: user.id, conversation_type: 'group').exists?
    end

    def transfer!(successor_id)
      successor = user.workspace.users.lock.find_by(id: successor_id, status: 'active', deleted_at: nil, demo_account: false)
      raise InvalidRequest, 'Choose another active member of your workspace to take ownership.' unless successor && successor.id != user.id
      raise InvalidRequest, 'The successor also has a pending deletion.' if AccountDeletionRequest.where(user: successor, status: 'scheduled').exists?
      if user.site_admin?
        raise InvalidRequest, 'Assign another site administrator before deleting your account.' unless User.where(site_admin: true, deleted_at: nil).where.not(id: user.id).exists?
      end
      if user.owner?
        UserRole.find_or_create_by!(user: successor, role: Role.find_by!(name: 'owner'), workspace: user.workspace)
        UserRole.where(user: user, role: Role.find_by!(name: 'owner')).destroy_all
        user.instance_variable_set(:@role_names, nil)
      end
      owned_projects = Project.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:id)
      operations_projects = ProjectDeployment.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:project_id) +
        ProjectDeploymentSeries.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).pluck(:project_id) +
        ProjectOperationItem.unscoped.where(workspace_id: user.workspace_id).where("details ->> 'owner_id' = ?", user.id.to_s).pluck(:project_id)
      (operations_projects.uniq - owned_projects).each do |project_id|
        unless ProjectUser.where(project_id: project_id, user_id: successor.id, status: 'active').exists?
          raise InvalidRequest, 'The successor must already be an active member of each operational project you do not own.'
        end
      end
      owned_projects.each do |project_id|
        membership = ProjectUser.find_or_initialize_by(project_id: project_id, user_id: successor.id)
        membership.assign_attributes(workspace: user.workspace, role: 'owner', status: 'active')
        membership.save!
      end
      Team.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).find_each do |team|
        membership = TeamUser.find_or_initialize_by(team: team, user: successor, workspace: user.workspace)
        membership.assign_attributes(role: 'admin', status: 'accepted')
        membership.save!
      end
      [Project, Team, ProjectDeployment, ProjectDeploymentSeries].each do |model|
        model.unscoped.where(workspace_id: user.workspace_id, owner_id: user.id).update_all(owner_id: successor.id, updated_at: Time.current)
      end
      Department.unscoped.where(workspace_id: user.workspace_id, manager_id: user.id).update_all(manager_id: successor.id)
      ProjectOperationItem.unscoped.where(workspace_id: user.workspace_id).where("details ->> 'owner_id' = ?", user.id.to_s).find_each do |item|
        item.update!(details: item.details.merge('owner_id' => successor.id))
      end
      Conversation.unscoped.where(workspace_id: user.workspace_id, creator_id: user.id, conversation_type: 'group').find_each do |conversation|
        unless ConversationParticipant.unscoped.exists?(conversation_id: conversation.id, user_id: successor.id)
          raise InvalidRequest, 'The successor must already be a member of every group chat you own. Direct chats are never transferred.'
        end
        conversation.update!(creator: successor)
      end
      # Administrative status is retained only until final removal.
      user.update_column(:site_admin, false) if user.site_admin?
    end

    def personal_cleanup!
      WebSession.where(user: user).delete_all
      MobileSession.where(user: user).or(MobileSession.where(impersonated_user_id: user.id)).delete_all
      McpAuditLog.unscoped.where(user: user).delete_all
      McpAccessToken.where(user: user).destroy_all
      PushDelivery.where(recipient_id: user.id).destroy_all
      MobileDevice.where(user: user).destroy_all
      notifications = Notification.unscoped.where(recipient_id: user.id).or(Notification.unscoped.where(actor_id: user.id))
      PushDelivery.where(notification_id: notifications.select(:id)).destroy_all
      OperationReminderDelivery.unscoped.where(notification_id: notifications.select(:id)).update_all(notification_id: nil)
      notifications.destroy_all
      # Purge active storage uploads synchronously before issuing a completion receipt.
      document_ids = user.pdf_documents.pluck(:id)
      upload_records = { 'User' => [user.id], 'Post' => user.posts.pluck(:id), 'Message' => user.messages.pluck(:id),
        'PdfDocument' => document_ids, 'PdfDocumentVersion' => PdfDocumentVersion.where(pdf_document_id: document_ids).pluck(:id),
        'PdfDocumentArtifact' => user.pdf_document_artifacts.pluck(:id),
        'PdfDocumentOperation' => user.pdf_document_operations.pluck(:id) }
      upload_records.each do |type, ids|
        ActiveStorage::Attachment.where(record_type: type, record_id: ids).find_each(&:purge)
      end
      DepartmentComment.where(author_id:user.id).destroy_all
      DepartmentJoinRequest.where(user_id:user.id).destroy_all
      DepartmentEntry.where(author_id:user.id).update_all(author_id:nil)
      user.scheduled_chat_messages.destroy_all
      user.messages.find_each do |message|
        message.attachments.purge
        message.message_reactions.destroy_all
        message.update_columns(body: '', deleted_at: Time.current, edited_at: nil, updated_at: Time.current)
      end
      %i[posts comments work_logs work_notes items knowledge_bookmarks knowledge_prompt_runs knowledge_items pdf_documents pdf_document_operations pdf_document_artifacts post_likes learning_goals given_skill_endorsements user_skills message_reactions calendar_events].each do |association|
        user.public_send(association).destroy_all
      end
      user.profile_picture.purge
      user.cover_photo.purge
      # Legacy social tables have no application models, but still contain user data.
      connection = ApplicationRecord.connection
      connection.execute("DELETE FROM friendships WHERE follower_id = #{Integer(user.id)} OR followed_id = #{Integer(user.id)}")
      connection.execute("DELETE FROM topic_follows WHERE user_id = #{Integer(user.id)}")
      [user.team_users, user.project_users, user.conversation_participants, user.user_roles].each(&:destroy_all)
      OperationReminderDelivery.unscoped.where(recipient_id: user.id).destroy_all
      user.call_participants.destroy_all
    end

    def deleted_attributes
      {
        first_name: 'Deleted', last_name: 'User', email: "deleted-#{SecureRandom.uuid}@account.invalid",
        encrypted_password: Devise::Encryptor.digest(User, SecureRandom.hex(64)), status: 'locked',
        bio: nil, phone_number: nil, date_of_birth: nil, social_links: {}, home_preferences: {},
        notification_preferences: {}, push_notification_settings: {}, site_admin: false,
        job_title: 'Former member', department_id: nil, department_role: 'member', last_seen_at: nil,
        confirmation_token: nil, confirmation_sent_at: nil, unconfirmed_email: nil,
        reset_password_token: nil, reset_password_sent_at: nil, remember_created_at: nil, jti: nil,
        keka_base_url: nil, keka_employee_id: nil, keka_last_synced_at: nil, keka_profile_data: {},
        encrypted_keka_api_key: nil, encrypted_keka_api_key_iv: nil
      }
    end
  end
end
