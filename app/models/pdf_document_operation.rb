class PdfDocumentOperation < ApplicationRecord
  include WorkspaceScoped

  STATUSES = %w[queued processing completed failed].freeze
  PROCESSING_LEASE_KEY = "_processing_lease".freeze
  PROCESSING_LEASE_DURATION = 5.minutes
  class LostProcessingLease < StandardError; end

  # The persisted token fences off a worker that resumes after its lease was
  # reclaimed. This accessor retains the token held by this runner instance.
  attr_accessor :processing_lease_token

  belongs_to :user, inverse_of: :pdf_document_operations
  belongs_to :pdf_document, optional: true, inverse_of: :operations
  belongs_to :base_version, class_name: "PdfDocumentVersion", optional: true
  has_many_attached :source_files
  has_many :artifacts,
           class_name: "PdfDocumentArtifact",
           dependent: :destroy,
           inverse_of: :pdf_document_operation

  validates :kind, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :progress, numericality: { only_integer: true, in: 0..100 }

  def processing_lease_expires_at
    raw = parameters.dig(PROCESSING_LEASE_KEY, "expires_at")
    raw.present? ? Time.iso8601(raw) : (started_at || updated_at || Time.current) + PROCESSING_LEASE_DURATION
  rescue ArgumentError, TypeError
    (started_at || updated_at || Time.current) + PROCESSING_LEASE_DURATION
  end

  def owns_processing_lease?
    status == "processing" && processing_lease_token.present? &&
      parameters.dig(PROCESSING_LEASE_KEY, "token") == processing_lease_token
  end

  def assert_processing_lease!
    return unless parameters[PROCESSING_LEASE_KEY].present?
    raise LostProcessingLease, "PDF operation was resumed by another worker." unless owns_processing_lease?
  end
end
