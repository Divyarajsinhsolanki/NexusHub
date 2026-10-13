class CreateBillingSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :billing_subscriptions do |t|
      t.references :workspace, null: false, foreign_key: true, index: { unique: true }
      t.string :provider, null: false
      t.string :plan_key, null: false
      t.string :external_id
      t.string :customer_id
      t.string :status, null: false, default: "pending"
      t.string :attempt_key
      t.string :checkout_id
      t.text :checkout_url
      t.datetime :checkout_expires_at
      t.datetime :current_period_end
      t.boolean :cancel_at_period_end, null: false, default: false
      t.datetime :last_synced_at
      t.timestamps
    end
    add_index :billing_subscriptions, [:provider, :external_id], unique: true
    create_table :billing_webhook_events do |t|
      t.string :provider, null: false
      t.string :event_id, null: false
      t.string :event_type, null: false
      t.datetime :processed_at
      t.timestamps
    end
    add_index :billing_webhook_events, [:provider, :event_id], unique: true
  end
end
