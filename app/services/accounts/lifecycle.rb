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
      user.workspace.with_lock do
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
      WorkspaceOwnershipTransfer.required?(user)
    end

    def transfer!(successor_id)
      WorkspaceOwnershipTransfer.transfer!(user, successor_id: successor_id, allow_platform_transfer: true)
    rescue WorkspaceOwnershipTransfer::InvalidRequest => error
      raise InvalidRequest, error.message
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
      binds = [ActiveRecord::Relation::QueryAttribute.new("user_id", user.id, User.type_for_attribute("id"))]
      connection.exec_delete("DELETE FROM friendships WHERE follower_id = $1 OR followed_id = $1", "Erase friendships", binds)
      connection.exec_delete("DELETE FROM topic_follows WHERE user_id = $1", "Erase topic follows", binds)
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
        encrypted_keka_api_key: nil, encrypted_keka_api_key_iv: nil, keka_secret_ciphertext: nil
      }
    end
  end
end
