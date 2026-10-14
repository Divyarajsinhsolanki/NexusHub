class AddCallHostControls < ActiveRecord::Migration[7.1]
  def change
    add_reference :call_sessions, :host, foreign_key: { to_table: :users, on_delete: :nullify }
    add_column :call_participants, :removed_at, :datetime
  end
end
