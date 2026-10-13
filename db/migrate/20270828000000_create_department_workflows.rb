class CreateDepartmentWorkflows < ActiveRecord::Migration[7.1]
  def change
    create_table :department_entries do |t|
      t.references :workspace, null:false, foreign_key:true
      t.references :department, null:false, foreign_key:true
      t.references :author, foreign_key:{to_table: :users}
      t.string :kind, null:false
      t.string :title, null:false
      t.text :body
      t.string :url
      t.string :status, null:false, default:'active'
      t.integer :progress, null:false, default:0
      t.date :due_date
      t.boolean :pinned, null:false, default:false
      t.integer :lock_version, null:false, default:0
      t.timestamps
    end
    add_index :department_entries, [:department_id,:kind,:created_at]
    add_check_constraint :department_entries, "progress BETWEEN 0 AND 100", name:'department_goal_progress_valid'
    create_table :department_comments do |t|
      t.references :workspace, null:false, foreign_key:true
      t.references :department_entry, null:false, foreign_key:true
      t.references :author, foreign_key:{to_table: :users}
      t.text :body, null:false
      t.timestamps
    end
    create_table :department_join_requests do |t|
      t.references :workspace, null:false, foreign_key:true
      t.references :user, null:false, foreign_key:true
      t.references :department, null:false, foreign_key:true
      t.references :source_department, foreign_key:{to_table: :departments}
      t.text :reason
      t.string :status, null:false, default:'pending'
      t.boolean :source_approved, null:false, default:false
      t.boolean :target_approved, null:false, default:false
      t.references :source_approver, foreign_key:{to_table: :users}
      t.references :target_approver, foreign_key:{to_table: :users}
      t.datetime :resolved_at
      t.timestamps
    end
    add_index :department_join_requests,:user_id,unique:true,where:"status = 'pending'",name:'one_pending_department_request_per_user'
    add_index :department_join_requests,[:department_id,:status,:created_at],name:'department_requests_by_status'
  end
end
