module AbusePrevention
  module AttachmentBudget
    extend ActiveSupport::Concern
    included do
      around_create :check_workspace_storage_budget
    end

    private

    def check_workspace_storage_budget
      workspace = record.workspace if record.respond_to?(:workspace)
      return yield unless workspace
      StorageBudget.with_lock(workspace) do
        StorageBudget.check!(workspace, bytes: blob.byte_size, blob:)
        yield
      end
    end
  end
end
