class BindPushDevicesToMobileSessions < ActiveRecord::Migration[8.0]
  def change
    add_reference :mobile_devices, :mobile_session, foreign_key: true, null: true
  end
end
