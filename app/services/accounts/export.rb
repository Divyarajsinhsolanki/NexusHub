module Accounts
  class Export
    COLLECTIONS = {
      posts: %w[id message created_at updated_at], comments: %w[id post_id body created_at],
      messages: %w[id conversation_id body reply_to_id created_at edited_at deleted_at],
      work_logs: %w[id log_date start_time end_time title description actual_minutes created_at],
      work_notes: %w[id note_date content created_at updated_at],
      items: %w[id title content created_at updated_at],
      learning_goals: %w[id title description due_date progress created_at updated_at],
      knowledge_items: %w[id title body summary category source_url tags created_at updated_at],
      knowledge_bookmarks: %w[id card_type collection_name source_id payload created_at],
      pdf_documents: %w[id title original_filename created_at updated_at],
      scheduled_meetings: %w[id title description starts_at ends_at status call_type created_at updated_at],
      meeting_invitations: %w[id scheduled_meeting_id response created_at updated_at],
      calendar_events: %w[id title description start_at end_at location_or_meet_link recurrence_rule created_at updated_at]
    }.freeze

    def self.call(user)
      profile = user.attributes.slice(*%w[id first_name last_name email job_title bio phone_number date_of_birth social_links created_at])
      payload = { format_version: 1, exported_at: Time.current.iso8601, profile: profile,
        note: 'Contains your personal records and temporary download links for your uploads. Sign in to the same account to download files. Shared workspace records and other members’ private data are excluded.' }
      COLLECTIONS.each do |association, fields|
        payload[association] = user.public_send(association).map do |record|
          value = record.attributes.slice(*fields)
          value['content'] = record.content if association == :items
          value
        end
      end
      document_ids = user.pdf_documents.pluck(:id)
      records = { 'User' => [user.id], 'Post' => user.posts.pluck(:id), 'Message' => user.messages.pluck(:id),
        'PdfDocument' => document_ids, 'PdfDocumentVersion' => PdfDocumentVersion.where(pdf_document_id: document_ids).pluck(:id),
        'PdfDocumentArtifact' => user.pdf_document_artifacts.pluck(:id),
        'PdfDocumentOperation' => user.pdf_document_operations.pluck(:id) }
      attachments = records.flat_map { |type, ids| ActiveStorage::Attachment.where(record_type: type, record_id: ids).includes(:blob).to_a }
      options = Rails.application.routes.default_url_options.merge(host: ENV.fetch('BASE_URL', 'http://localhost:3000'))
      payload[:department_comments] = DepartmentComment.where(author_id:user.id).map { |record| record.attributes.slice('id','department_entry_id','body','created_at') }
      payload[:department_requests] = DepartmentJoinRequest.where(user_id:user.id).map { |record| record.attributes.slice('id','department_id','source_department_id','reason','status','created_at') }
      payload[:uploads] = attachments.select { |attachment| PrivateFiles::Access.allowed?(attachment.blob, user) }.map do |attachment|
        blob = attachment.blob
        { filename: blob.filename.to_s, content_type: blob.content_type, byte_size: blob.byte_size,
          record_type: attachment.record_type, record_id: attachment.record_id,
          download_url: Rails.application.routes.url_helpers.rails_service_blob_url(blob.signed_id(expires_in: 1.hour), blob.filename, **options),
          expires_at: 1.hour.from_now.iso8601 }
      end
      payload
    end
  end
end
