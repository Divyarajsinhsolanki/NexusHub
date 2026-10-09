class EncryptExistingVaultContents < ActiveRecord::Migration[7.1]
  def up
    [Item, ProjectVaultItem].each do |model|
      model.unscoped.find_each do |record|
        next if record.encrypted_attribute?(:content)

        record.update_columns(content: record.content)
      end
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, 'Vault contents must remain encrypted.'
  end
end
