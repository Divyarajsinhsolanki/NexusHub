Rails.application.config.to_prepare do
  klass = ActiveStorage::Attached::Changes::CreateOne
  klass.prepend(PrivateFiles::AttachmentGuard) unless klass.ancestors.any? { |ancestor| ancestor.name == "PrivateFiles::AttachmentGuard" }
end

# Keep the old public service readable for migration, but never create new public
# uploads if an existing deployment still selects that service explicitly.
ActiveSupport.on_load(:active_storage_blob) do
  before_create do
    if Rails.env.production? && service_name == "cloudinary"
      raise ActiveStorage::IntegrityError, "Public storage is retired; configure private_cloudinary or private S3."
    end
  end
end

ActiveSupport.on_load(:active_storage_attachment) do
  include AbusePrevention::AttachmentBudget
end
