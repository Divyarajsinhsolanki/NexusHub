# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2027_09_12_000000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "account_deletion_requests", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "status", default: "verification_pending", null: false
    t.string "verification_digest"
    t.datetime "verification_expires_at"
    t.integer "verification_attempts", default: 0, null: false
    t.datetime "code_sent_at"
    t.datetime "delete_after"
    t.datetime "completed_at"
    t.string "receipt_id", null: false
    t.text "failure_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["status", "delete_after"], name: "index_account_deletion_requests_on_status_and_delete_after"
    t.index ["user_id"], name: "index_account_deletion_requests_on_user_id", unique: true
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index "(((NULLIF(metadata, ''::text))::jsonb ->> 'workspace_id'::text)), created_at", name: "index_blobs_on_upload_workspace_and_created_at", where: "(((NULLIF(metadata, ''::text))::jsonb ->> 'mobile_upload'::text) = 'true'::text)"
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "billing_subscriptions", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.string "provider", null: false
    t.string "plan_key", null: false
    t.string "external_id"
    t.string "customer_id"
    t.string "status", default: "pending", null: false
    t.string "attempt_key"
    t.string "checkout_id"
    t.text "checkout_url"
    t.datetime "checkout_expires_at"
    t.datetime "current_period_end"
    t.boolean "cancel_at_period_end", default: false, null: false
    t.datetime "last_synced_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["provider", "external_id"], name: "index_billing_subscriptions_on_provider_and_external_id", unique: true
    t.index ["workspace_id"], name: "index_billing_subscriptions_on_workspace_id", unique: true
  end

  create_table "billing_webhook_events", force: :cascade do |t|
    t.string "provider", null: false
    t.string "event_id", null: false
    t.string "event_type", null: false
    t.datetime "processed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["provider", "event_id"], name: "index_billing_webhook_events_on_provider_and_event_id", unique: true
  end

  create_table "calendar_events", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "project_id"
    t.bigint "task_id"
    t.bigint "sprint_id"
    t.string "title", null: false
    t.text "description"
    t.datetime "start_at", null: false
    t.datetime "end_at", null: false
    t.boolean "all_day", default: false, null: false
    t.string "event_type", default: "meeting", null: false
    t.string "visibility", default: "personal", null: false
    t.string "status", default: "scheduled", null: false
    t.string "location_or_meet_link"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "recurrence_rule", default: "none", null: false
    t.datetime "recurrence_until"
    t.bigint "recurrence_parent_id"
    t.string "external_source"
    t.string "external_id"
    t.bigint "workspace_id", null: false
    t.string "operation_source_type"
    t.bigint "operation_source_id"
    t.bigint "scheduled_meeting_id"
    t.index ["event_type"], name: "index_calendar_events_on_event_type"
    t.index ["external_source", "external_id"], name: "index_calendar_events_on_external_source_and_external_id"
    t.index ["operation_source_type", "operation_source_id"], name: "idx_calendar_operation_source", unique: true
    t.index ["project_id"], name: "index_calendar_events_on_project_id"
    t.index ["recurrence_parent_id"], name: "index_calendar_events_on_recurrence_parent_id"
    t.index ["scheduled_meeting_id"], name: "index_calendar_events_on_scheduled_meeting_id"
    t.index ["sprint_id"], name: "index_calendar_events_on_sprint_id"
    t.index ["task_id"], name: "index_calendar_events_on_task_id"
    t.index ["user_id", "start_at"], name: "index_calendar_events_on_user_id_and_start_at"
    t.index ["user_id"], name: "index_calendar_events_on_user_id"
    t.index ["visibility", "start_at"], name: "index_calendar_events_on_visibility_and_start_at"
    t.index ["workspace_id"], name: "index_calendar_events_on_workspace_id"
  end

  create_table "call_participants", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "call_session_id", null: false
    t.bigint "user_id", null: false
    t.string "status", default: "ringing", null: false
    t.datetime "ring_acknowledged_at"
    t.datetime "joined_at"
    t.datetime "left_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "media_confirmation_required", default: false, null: false
    t.datetime "media_last_seen_at"
    t.datetime "removed_at"
    t.datetime "approved_at"
    t.index ["call_session_id", "user_id"], name: "idx_unique_call_participant", unique: true
    t.index ["call_session_id"], name: "index_call_participants_on_call_session_id"
    t.index ["user_id"], name: "index_call_participants_on_user_id"
    t.index ["workspace_id", "user_id", "status"], name: "idx_call_participants_user_status"
    t.index ["workspace_id"], name: "index_call_participants_on_workspace_id"
  end

  create_table "call_sessions", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "conversation_id", null: false
    t.bigint "initiator_id", null: false
    t.string "call_type", null: false
    t.string "status", default: "ringing", null: false
    t.string "livekit_room_name", null: false
    t.datetime "started_at"
    t.datetime "ended_at"
    t.string "ended_reason"
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "public_id", null: false
    t.bigint "host_id"
    t.boolean "host_approval_required", default: false, null: false
    t.index ["conversation_id"], name: "idx_one_live_call_per_conversation", unique: true, where: "((status)::text = ANY ((ARRAY['ringing'::character varying, 'active'::character varying])::text[]))"
    t.index ["conversation_id"], name: "index_call_sessions_on_conversation_id"
    t.index ["host_id"], name: "index_call_sessions_on_host_id"
    t.index ["initiator_id"], name: "index_call_sessions_on_initiator_id"
    t.index ["livekit_room_name"], name: "index_call_sessions_on_livekit_room_name", unique: true
    t.index ["public_id"], name: "index_call_sessions_on_public_id", unique: true
    t.index ["status", "created_at"], name: "idx_call_sessions_status_created"
    t.index ["workspace_id", "conversation_id", "created_at"], name: "idx_call_sessions_conversation_history"
    t.index ["workspace_id"], name: "index_call_sessions_on_workspace_id"
  end

  create_table "comments", force: :cascade do |t|
    t.bigint "post_id", null: false
    t.bigint "user_id", null: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["post_id", "created_at"], name: "index_comments_on_post_id_and_created_at"
    t.index ["post_id"], name: "index_comments_on_post_id"
    t.index ["user_id"], name: "index_comments_on_user_id"
    t.index ["workspace_id"], name: "index_comments_on_workspace_id"
  end

  create_table "contacts", force: :cascade do |t|
    t.string "name", null: false
    t.string "email", null: false
    t.text "message", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "conversation_participants", force: :cascade do |t|
    t.bigint "conversation_id", null: false
    t.bigint "user_id", null: false
    t.datetime "last_read_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.datetime "hidden_at"
    t.datetime "muted_at"
    t.datetime "muted_until"
    t.bigint "last_delivered_message_id"
    t.bigint "last_read_message_id"
    t.datetime "last_delivered_at"
    t.datetime "removed_at"
    t.index ["conversation_id", "last_delivered_message_id"], name: "idx_conversation_participants_delivery_cursor"
    t.index ["conversation_id", "last_read_message_id"], name: "idx_conversation_participants_read_cursor"
    t.index ["conversation_id", "muted_until"], name: "idx_on_conversation_id_muted_until_3907826291"
    t.index ["conversation_id", "user_id"], name: "idx_unique_conversation_participant", unique: true
    t.index ["conversation_id"], name: "index_conversation_participants_on_conversation_id"
    t.index ["user_id", "hidden_at"], name: "index_conversation_participants_on_user_id_and_hidden_at"
    t.index ["user_id"], name: "index_conversation_participants_on_user_id"
    t.index ["workspace_id", "user_id", "hidden_at"], name: "idx_conversation_participants_visible_inbox"
    t.index ["workspace_id"], name: "index_conversation_participants_on_workspace_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.string "title"
    t.string "conversation_type", default: "direct", null: false
    t.bigint "creator_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.bigint "last_message_id"
    t.datetime "last_message_at"
    t.text "description"
    t.boolean "members_can_edit_group_info", default: false, null: false
    t.index ["conversation_type"], name: "index_conversations_on_conversation_type"
    t.index ["creator_id"], name: "index_conversations_on_creator_id"
    t.index ["last_message_id"], name: "index_conversations_on_last_message_id"
    t.index ["workspace_id", "last_message_at"], name: "index_conversations_on_workspace_id_and_last_message_at"
    t.index ["workspace_id", "updated_at"], name: "index_conversations_on_workspace_id_and_updated_at"
    t.index ["workspace_id"], name: "index_conversations_on_workspace_id"
  end

  create_table "department_comments", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "department_entry_id", null: false
    t.bigint "author_id"
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "index_department_comments_on_author_id"
    t.index ["department_entry_id"], name: "index_department_comments_on_department_entry_id"
    t.index ["workspace_id"], name: "index_department_comments_on_workspace_id"
  end

  create_table "department_entries", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "department_id", null: false
    t.bigint "author_id"
    t.string "kind", null: false
    t.string "title", null: false
    t.text "body"
    t.string "url"
    t.string "status", default: "active", null: false
    t.integer "progress", default: 0, null: false
    t.date "due_date"
    t.boolean "pinned", default: false, null: false
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "index_department_entries_on_author_id"
    t.index ["department_id", "kind", "created_at"], name: "idx_on_department_id_kind_created_at_0e24b148f5"
    t.index ["department_id"], name: "index_department_entries_on_department_id"
    t.index ["workspace_id"], name: "index_department_entries_on_workspace_id"
    t.check_constraint "progress >= 0 AND progress <= 100", name: "department_goal_progress_valid"
  end

  create_table "department_join_requests", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "department_id", null: false
    t.bigint "source_department_id"
    t.text "reason"
    t.string "status", default: "pending", null: false
    t.boolean "source_approved", default: false, null: false
    t.boolean "target_approved", default: false, null: false
    t.bigint "source_approver_id"
    t.bigint "target_approver_id"
    t.datetime "resolved_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["department_id", "status", "created_at"], name: "department_requests_by_status"
    t.index ["department_id"], name: "index_department_join_requests_on_department_id"
    t.index ["source_approver_id"], name: "index_department_join_requests_on_source_approver_id"
    t.index ["source_department_id"], name: "index_department_join_requests_on_source_department_id"
    t.index ["target_approver_id"], name: "index_department_join_requests_on_target_approver_id"
    t.index ["user_id"], name: "index_department_join_requests_on_user_id"
    t.index ["user_id"], name: "one_pending_department_request_per_user", unique: true, where: "((status)::text = 'pending'::text)"
    t.index ["workspace_id"], name: "index_department_join_requests_on_workspace_id"
  end

  create_table "departments", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "description"
    t.bigint "manager_id"
    t.bigint "workspace_id", null: false
    t.index ["manager_id"], name: "index_departments_on_manager_id"
    t.index ["workspace_id", "name"], name: "index_departments_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_departments_on_workspace_id"
  end

  create_table "event_reminders", force: :cascade do |t|
    t.bigint "calendar_event_id", null: false
    t.string "channel", default: "in_app", null: false
    t.integer "minutes_before", default: 10, null: false
    t.datetime "send_at", null: false
    t.datetime "sent_at"
    t.string "state", default: "pending", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["calendar_event_id", "minutes_before", "channel"], name: "idx_unique_event_reminder_window", unique: true
    t.index ["calendar_event_id"], name: "index_event_reminders_on_calendar_event_id"
    t.index ["state", "send_at"], name: "index_event_reminders_on_state_and_send_at"
    t.index ["workspace_id"], name: "index_event_reminders_on_workspace_id"
  end

  create_table "friendships", force: :cascade do |t|
    t.bigint "follower_id", null: false
    t.bigint "followed_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["followed_id"], name: "index_friendships_on_followed_id"
    t.index ["follower_id", "followed_id"], name: "index_friendships_on_follower_id_and_followed_id", unique: true
    t.index ["follower_id"], name: "index_friendships_on_follower_id"
    t.index ["workspace_id"], name: "index_friendships_on_workspace_id"
  end

  create_table "issues", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.string "issue_key", null: false
    t.string "title", null: false
    t.string "status", default: "New", null: false
    t.string "severity", default: "Medium", null: false
    t.string "category"
    t.string "module_name"
    t.string "sub_module"
    t.string "sprint_name"
    t.string "task_id"
    t.string "found_by"
    t.date "found_on"
    t.text "issue_description"
    t.text "pre_conditions"
    t.text "repro_steps"
    t.text "actual_result"
    t.text "expected_result"
    t.string "attachment"
    t.text "comment"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "media_urls", default: [], null: false
    t.jsonb "attachment_urls", default: [], null: false
    t.string "owner"
    t.string "owner_email"
    t.string "assignee"
    t.string "assignee_email"
    t.string "assignee_slack"
    t.date "due_date"
    t.string "section_detail"
    t.string "mf6_app"
    t.string "local_qa"
    t.string "team_test"
    t.text "comment_qa"
    t.text "dev_comments_dated"
    t.text "developer_comment"
    t.string "issue_present_in_rails4"
    t.bigint "reporter_id"
    t.bigint "assignee_user_id"
    t.bigint "workspace_id", null: false
    t.index ["assignee"], name: "index_issues_on_assignee"
    t.index ["assignee_user_id"], name: "index_issues_on_assignee_user_id"
    t.index ["due_date"], name: "index_issues_on_due_date"
    t.index ["local_qa"], name: "index_issues_on_local_qa"
    t.index ["mf6_app"], name: "index_issues_on_mf6_app"
    t.index ["project_id"], name: "index_issues_on_project_id"
    t.index ["reporter_id"], name: "index_issues_on_reporter_id"
    t.index ["team_test"], name: "index_issues_on_team_test"
    t.index ["workspace_id", "issue_key"], name: "index_issues_on_workspace_id_and_issue_key", unique: true
    t.index ["workspace_id"], name: "index_issues_on_workspace_id"
  end

  create_table "items", force: :cascade do |t|
    t.string "title", null: false
    t.string "category"
    t.text "content", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["user_id"], name: "index_items_on_user_id"
    t.index ["workspace_id"], name: "index_items_on_workspace_id"
  end

  create_table "knowledge_bookmarks", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "card_type", null: false
    t.string "collection_name"
    t.string "source_id"
    t.jsonb "payload", default: {}, null: false
    t.datetime "last_viewed_at"
    t.datetime "last_reminded_at"
    t.datetime "next_reminder_at"
    t.integer "reminder_interval_days", default: 7, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["collection_name"], name: "index_knowledge_bookmarks_on_collection_name"
    t.index ["next_reminder_at"], name: "index_knowledge_bookmarks_on_next_reminder_at"
    t.index ["user_id", "card_type", "source_id"], name: "index_knowledge_bookmarks_on_identity", unique: true
    t.index ["user_id", "next_reminder_at"], name: "index_knowledge_bookmarks_on_user_next_reminder"
    t.index ["user_id"], name: "index_knowledge_bookmarks_on_user_id"
    t.index ["workspace_id"], name: "index_knowledge_bookmarks_on_workspace_id"
  end

  create_table "knowledge_items", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "knowledge_prompt_run_id", null: false
    t.string "title", null: false
    t.text "summary"
    t.text "body"
    t.string "category", default: "learning", null: false
    t.string "item_type", default: "fact", null: false
    t.string "collection_name"
    t.string "source_name"
    t.string "source_url"
    t.string "source_key", null: false
    t.datetime "published_at"
    t.jsonb "tags", default: [], null: false
    t.jsonb "payload", default: {}, null: false
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.bigint "replaced_by_id"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["knowledge_prompt_run_id", "position"], name: "idx_knowledge_items_run_position"
    t.index ["knowledge_prompt_run_id"], name: "index_knowledge_items_on_knowledge_prompt_run_id"
    t.index ["replaced_by_id"], name: "index_knowledge_items_on_replaced_by_id"
    t.index ["user_id", "active", "created_at"], name: "idx_knowledge_items_user_active_created"
    t.index ["user_id", "source_key", "active"], name: "idx_knowledge_items_user_source_active"
    t.index ["user_id"], name: "index_knowledge_items_on_user_id"
    t.index ["workspace_id", "category", "active"], name: "idx_knowledge_items_workspace_category_active"
    t.index ["workspace_id"], name: "index_knowledge_items_on_workspace_id"
  end

  create_table "knowledge_prompt_runs", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "mcp_access_token_id"
    t.text "prompt", null: false
    t.string "source", default: "mcp", null: false
    t.string "generation_mode", default: "history", null: false
    t.string "status", default: "completed", null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "workspace_id, ((metadata ->> 'daily_date'::text))", name: "idx_daily_knowledge_workspace_date", unique: true, where: "(((source)::text = 'bedrock_daily'::text) AND ((metadata ->> 'daily_date'::text) IS NOT NULL))"
    t.index ["mcp_access_token_id"], name: "index_knowledge_prompt_runs_on_mcp_access_token_id"
    t.index ["user_id"], name: "index_knowledge_prompt_runs_on_user_id"
    t.index ["workspace_id", "generation_mode", "status"], name: "idx_knowledge_prompt_runs_mode_status"
    t.index ["workspace_id", "user_id", "created_at"], name: "idx_knowledge_prompt_runs_workspace_user_created"
    t.index ["workspace_id"], name: "index_knowledge_prompt_runs_on_workspace_id"
  end

  create_table "learning_checkpoints", force: :cascade do |t|
    t.bigint "learning_goal_id", null: false
    t.string "title", null: false
    t.boolean "completed", default: false, null: false
    t.string "resource_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["learning_goal_id"], name: "index_learning_checkpoints_on_learning_goal_id"
    t.index ["workspace_id"], name: "index_learning_checkpoints_on_workspace_id"
  end

  create_table "learning_goals", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "team_id"
    t.string "title", null: false
    t.date "due_date"
    t.integer "progress", default: 0, null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["team_id"], name: "index_learning_goals_on_team_id"
    t.index ["user_id"], name: "index_learning_goals_on_user_id"
    t.index ["workspace_id"], name: "index_learning_goals_on_workspace_id"
  end

  create_table "mcp_access_tokens", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "token_digest", null: false
    t.jsonb "scopes", default: [], null: false
    t.datetime "last_used_at"
    t.datetime "expires_at"
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["revoked_at"], name: "index_mcp_access_tokens_on_revoked_at"
    t.index ["token_digest"], name: "index_mcp_access_tokens_on_token_digest", unique: true
    t.index ["user_id"], name: "index_mcp_access_tokens_on_user_id"
    t.index ["workspace_id", "user_id"], name: "index_mcp_access_tokens_on_workspace_id_and_user_id"
    t.index ["workspace_id"], name: "index_mcp_access_tokens_on_workspace_id"
  end

  create_table "mcp_audit_logs", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "mcp_access_token_id"
    t.string "tool_name", null: false
    t.string "action", null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["mcp_access_token_id"], name: "index_mcp_audit_logs_on_mcp_access_token_id"
    t.index ["tool_name", "action"], name: "index_mcp_audit_logs_on_tool_name_and_action"
    t.index ["user_id"], name: "index_mcp_audit_logs_on_user_id"
    t.index ["workspace_id", "created_at"], name: "index_mcp_audit_logs_on_workspace_id_and_created_at"
    t.index ["workspace_id"], name: "index_mcp_audit_logs_on_workspace_id"
  end

  create_table "meeting_invitations", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "scheduled_meeting_id", null: false
    t.bigint "user_id", null: false
    t.bigint "calendar_event_id"
    t.string "response", default: "invited", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["calendar_event_id"], name: "index_meeting_invitations_on_calendar_event_id"
    t.index ["scheduled_meeting_id", "user_id"], name: "index_meeting_invitations_on_scheduled_meeting_id_and_user_id", unique: true
    t.index ["scheduled_meeting_id"], name: "index_meeting_invitations_on_scheduled_meeting_id"
    t.index ["user_id"], name: "index_meeting_invitations_on_user_id"
    t.index ["workspace_id"], name: "index_meeting_invitations_on_workspace_id"
  end

  create_table "message_reactions", force: :cascade do |t|
    t.bigint "message_id", null: false
    t.bigint "user_id", null: false
    t.string "emoji", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["message_id", "user_id", "emoji"], name: "idx_unique_message_reaction", unique: true
    t.index ["message_id"], name: "index_message_reactions_on_message_id"
    t.index ["user_id"], name: "index_message_reactions_on_user_id"
    t.index ["workspace_id"], name: "index_message_reactions_on_workspace_id"
  end

  create_table "messages", force: :cascade do |t|
    t.bigint "conversation_id", null: false
    t.bigint "user_id", null: false
    t.text "body"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.string "client_id"
    t.string "message_type", default: "message", null: false
    t.bigint "reply_to_id"
    t.datetime "edited_at"
    t.datetime "deleted_at"
    t.datetime "pinned_at"
    t.bigint "pinned_by_id"
    t.index ["conversation_id", "created_at"], name: "index_messages_on_conversation_id_and_created_at"
    t.index ["conversation_id", "pinned_at"], name: "index_messages_on_conversation_id_and_pinned_at"
    t.index ["conversation_id", "reply_to_id"], name: "index_messages_on_conversation_id_and_reply_to_id"
    t.index ["conversation_id", "user_id", "client_id"], name: "idx_messages_conversation_user_client", unique: true, where: "(client_id IS NOT NULL)"
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
    t.index ["pinned_by_id"], name: "index_messages_on_pinned_by_id"
    t.index ["reply_to_id"], name: "index_messages_on_reply_to_id"
    t.index ["user_id"], name: "index_messages_on_user_id"
    t.index ["workspace_id", "conversation_id", "id"], name: "idx_messages_workspace_conversation_cursor"
    t.index ["workspace_id"], name: "index_messages_on_workspace_id"
  end

  create_table "mobile_devices", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.string "expo_push_token", null: false
    t.string "platform", null: false
    t.string "device_identifier"
    t.string "device_name"
    t.string "app_version"
    t.boolean "active", default: true, null: false
    t.datetime "last_seen_at"
    t.datetime "disabled_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "push_schema_version", default: 1, null: false
    t.string "app_variant", default: "legacy", null: false
    t.string "native_build_version"
    t.bigint "mobile_session_id"
    t.index ["expo_push_token"], name: "index_mobile_devices_on_expo_push_token", unique: true
    t.index ["mobile_session_id"], name: "index_mobile_devices_on_mobile_session_id"
    t.index ["user_id", "active"], name: "index_mobile_devices_on_user_id_and_active"
    t.index ["user_id"], name: "index_mobile_devices_on_user_id"
    t.index ["workspace_id", "active"], name: "index_mobile_devices_on_workspace_id_and_active"
    t.index ["workspace_id"], name: "index_mobile_devices_on_workspace_id"
  end

  create_table "mobile_sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.string "refresh_token_digest", null: false
    t.string "device_name"
    t.datetime "expires_at", null: false
    t.datetime "last_used_at"
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "impersonated_user_id"
    t.datetime "primary_verified_at"
    t.datetime "mfa_verified_at"
    t.index ["expires_at"], name: "index_mobile_sessions_on_expires_at"
    t.index ["impersonated_user_id"], name: "index_mobile_sessions_on_impersonated_user_id"
    t.index ["refresh_token_digest"], name: "index_mobile_sessions_on_refresh_token_digest", unique: true
    t.index ["user_id", "revoked_at"], name: "index_mobile_sessions_on_user_id_and_revoked_at"
    t.index ["user_id"], name: "index_mobile_sessions_on_user_id"
    t.index ["workspace_id"], name: "index_mobile_sessions_on_workspace_id"
  end

  create_table "notifications", force: :cascade do |t|
    t.bigint "recipient_id", null: false
    t.bigint "actor_id", null: false
    t.datetime "read_at"
    t.string "action"
    t.string "notifiable_type", null: false
    t.bigint "notifiable_id", null: false
    t.jsonb "metadata"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.boolean "feed_visible", default: true, null: false
    t.string "group_key"
    t.index ["actor_id"], name: "index_notifications_on_actor_id"
    t.index ["notifiable_type", "notifiable_id"], name: "index_notifications_on_notifiable"
    t.index ["recipient_id", "action", "created_at"], name: "index_notifications_on_recipient_id_and_action_and_created_at"
    t.index ["recipient_id", "group_key", "created_at"], name: "idx_notifications_recipient_group_created"
    t.index ["recipient_id", "read_at"], name: "index_notifications_on_recipient_id_and_read_at"
    t.index ["recipient_id"], name: "index_notifications_on_recipient_id"
    t.index ["workspace_id"], name: "index_notifications_on_workspace_id"
  end

  create_table "operation_reminder_deliveries", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.bigint "recipient_id", null: false
    t.string "source_type", null: false
    t.bigint "source_id", null: false
    t.bigint "notification_id"
    t.string "schedule_revision", null: false
    t.string "channel", null: false
    t.string "state", default: "pending", null: false
    t.string "failure_class"
    t.datetime "send_at", null: false
    t.datetime "sent_at"
    t.datetime "claimed_at"
    t.integer "attempts", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["notification_id"], name: "index_operation_reminder_deliveries_on_notification_id"
    t.index ["project_id"], name: "index_operation_reminder_deliveries_on_project_id"
    t.index ["recipient_id"], name: "index_operation_reminder_deliveries_on_recipient_id"
    t.index ["source_type", "source_id", "schedule_revision", "recipient_id", "channel", "send_at"], name: "idx_unique_operation_reminder", unique: true
    t.index ["source_type", "source_id"], name: "index_operation_reminder_deliveries_on_source"
    t.index ["state", "send_at"], name: "idx_due_operation_reminders"
    t.index ["workspace_id"], name: "index_operation_reminder_deliveries_on_workspace_id"
  end

  create_table "pdf_document_artifacts", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "pdf_document_id"
    t.bigint "pdf_document_operation_id"
    t.string "kind", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_pdf_document_artifacts_on_expires_at"
    t.index ["pdf_document_id"], name: "index_pdf_document_artifacts_on_pdf_document_id"
    t.index ["pdf_document_operation_id"], name: "index_pdf_document_artifacts_on_pdf_document_operation_id"
    t.index ["user_id"], name: "index_pdf_document_artifacts_on_user_id"
    t.index ["workspace_id"], name: "index_pdf_document_artifacts_on_workspace_id"
  end

  create_table "pdf_document_edit_layers", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "pdf_document_id", null: false
    t.jsonb "geometry", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["pdf_document_id"], name: "index_pdf_document_edit_layers_on_pdf_document_id"
    t.index ["workspace_id"], name: "index_pdf_document_edit_layers_on_workspace_id"
  end

  create_table "pdf_document_operations", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.bigint "pdf_document_id"
    t.bigint "base_version_id"
    t.string "kind", null: false
    t.string "status", default: "queued", null: false
    t.integer "progress", default: 0, null: false
    t.jsonb "parameters", default: {}, null: false
    t.jsonb "result", default: {}, null: false
    t.text "error_message"
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["base_version_id"], name: "index_pdf_document_operations_on_base_version_id"
    t.index ["pdf_document_id"], name: "index_pdf_document_operations_on_pdf_document_id"
    t.index ["status", "created_at"], name: "index_pdf_document_operations_on_status_and_created_at"
    t.index ["user_id", "created_at"], name: "index_pdf_document_operations_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_pdf_document_operations_on_user_id"
    t.index ["workspace_id", "status", "user_id"], name: "index_pdf_operations_on_workspace_status_user"
    t.index ["workspace_id"], name: "index_pdf_document_operations_on_workspace_id"
  end

  create_table "pdf_document_versions", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "pdf_document_id", null: false
    t.bigint "created_by_id", null: false
    t.bigint "parent_version_id"
    t.integer "version_number", null: false
    t.string "operation", null: false
    t.integer "page_count"
    t.boolean "encrypted", default: false, null: false
    t.bigint "byte_size", default: 0, null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "edit_layer_id"
    t.index ["created_by_id"], name: "index_pdf_document_versions_on_created_by_id"
    t.index ["edit_layer_id"], name: "index_pdf_document_versions_on_edit_layer_id"
    t.index ["pdf_document_id", "version_number"], name: "idx_pdf_document_versions_number", unique: true
    t.index ["pdf_document_id"], name: "index_pdf_document_versions_on_pdf_document_id"
    t.index ["workspace_id"], name: "index_pdf_document_versions_on_workspace_id"
  end

  create_table "pdf_documents", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.string "title", null: false
    t.string "original_filename", null: false
    t.integer "page_count"
    t.boolean "encrypted", default: false, null: false
    t.bigint "current_version_id"
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "searchable_text"
    t.datetime "text_indexed_at"
    t.text "text_index_error"
    t.index ["user_id", "updated_at"], name: "index_pdf_documents_on_user_id_and_updated_at"
    t.index ["user_id"], name: "index_pdf_documents_on_user_id"
    t.index ["workspace_id", "user_id"], name: "index_pdf_documents_on_workspace_id_and_user_id"
    t.index ["workspace_id"], name: "index_pdf_documents_on_workspace_id"
  end

  create_table "portfolio_features", force: :cascade do |t|
    t.bigint "portfolio_project_id", null: false
    t.string "category", null: false
    t.string "title", null: false
    t.text "summary", null: false
    t.string "demo_path"
    t.string "alt_text"
    t.integer "position", default: 0, null: false
    t.boolean "published", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "review_notes"
    t.integer "tour_position", default: 0, null: false
    t.index ["portfolio_project_id", "published", "position"], name: "idx_portfolio_features_order"
    t.index ["portfolio_project_id", "tour_position"], name: "idx_portfolio_features_tour_order"
    t.index ["portfolio_project_id"], name: "index_portfolio_features_on_portfolio_project_id"
  end

  create_table "portfolio_profiles", force: :cascade do |t|
    t.string "full_name", null: false
    t.string "headline", null: false
    t.string "location"
    t.text "summary", null: false
    t.jsonb "skills", default: [], null: false
    t.jsonb "metrics", default: [], null: false
    t.jsonb "social_links", default: {}, null: false
    t.jsonb "architecture", default: [], null: false
    t.jsonb "engineering_highlights", default: [], null: false
    t.boolean "published", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "portfolio_projects", force: :cascade do |t|
    t.string "title", null: false
    t.string "slug", null: false
    t.string "tagline"
    t.text "summary", null: false
    t.text "description"
    t.jsonb "stack", default: [], null: false
    t.jsonb "metrics", default: [], null: false
    t.jsonb "engineering_highlights", default: [], null: false
    t.string "repository_url"
    t.string "live_url"
    t.integer "position", default: 0, null: false
    t.boolean "featured", default: false, null: false
    t.boolean "published", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "case_study", default: {}, null: false
    t.jsonb "seo", default: {}, null: false
    t.index ["published", "position"], name: "index_portfolio_projects_on_published_and_position"
    t.index ["slug"], name: "index_portfolio_projects_on_slug", unique: true
  end

  create_table "post_likes", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "post_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["post_id", "user_id"], name: "index_post_likes_on_post_id_and_user_id", unique: true
    t.index ["post_id"], name: "index_post_likes_on_post_id"
    t.index ["user_id", "post_id"], name: "index_post_likes_on_user_id_and_post_id", unique: true
    t.index ["user_id"], name: "index_post_likes_on_user_id"
    t.index ["workspace_id"], name: "index_post_likes_on_workspace_id"
  end

  create_table "posts", force: :cascade do |t|
    t.string "message"
    t.string "image"
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "comments_count", default: 0, null: false
    t.bigint "workspace_id", null: false
    t.index ["created_at"], name: "index_posts_on_created_at"
    t.index ["user_id"], name: "index_posts_on_user_id"
    t.index ["workspace_id"], name: "index_posts_on_workspace_id"
  end

  create_table "privacy_request_events", force: :cascade do |t|
    t.bigint "privacy_request_id", null: false
    t.bigint "actor_id"
    t.string "action", null: false
    t.string "status", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_id"], name: "index_privacy_request_events_on_actor_id"
    t.index ["privacy_request_id"], name: "index_privacy_request_events_on_privacy_request_id"
  end

  create_table "privacy_requests", force: :cascade do |t|
    t.string "reference", null: false
    t.string "request_type", null: false
    t.string "status", default: "pending_verification", null: false
    t.text "payload_ciphertext"
    t.datetime "email_verified_at"
    t.datetime "identity_verified_at"
    t.datetime "target_response_at", null: false
    t.datetime "closed_at"
    t.datetime "redacted_at"
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["reference"], name: "index_privacy_requests_on_reference", unique: true
    t.index ["status", "target_response_at"], name: "index_privacy_requests_on_status_and_target_response_at"
  end

  create_table "project_deployment_series", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.bigint "project_environment_id", null: false
    t.bigint "owner_id", null: false
    t.string "name", null: false
    t.string "time_zone", null: false
    t.string "frequency", null: false
    t.string "local_time", null: false
    t.date "starts_on", null: false
    t.date "ends_on"
    t.integer "day_of_month"
    t.jsonb "weekdays", default: [], null: false
    t.jsonb "recipient_ids", default: [], null: false
    t.jsonb "reminder_minutes", default: [1440, 60], null: false
    t.jsonb "targets", default: [], null: false
    t.text "notes"
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_project_deployment_series_on_owner_id"
    t.index ["project_environment_id"], name: "index_project_deployment_series_on_project_environment_id"
    t.index ["project_id"], name: "index_project_deployment_series_on_project_id"
    t.index ["workspace_id"], name: "index_project_deployment_series_on_workspace_id"
  end

  create_table "project_deployments", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.bigint "project_environment_id", null: false
    t.bigint "project_deployment_series_id"
    t.bigint "owner_id", null: false
    t.bigint "verified_by_id"
    t.string "name", null: false
    t.string "time_zone", null: false
    t.string "status", default: "planned", null: false
    t.string "occurrence_key"
    t.datetime "scheduled_at", null: false
    t.datetime "started_at"
    t.datetime "deployed_at"
    t.datetime "verified_at"
    t.integer "schedule_revision", default: 0, null: false
    t.jsonb "recipient_ids", default: [], null: false
    t.jsonb "reminder_minutes", default: [1440, 60], null: false
    t.jsonb "targets", default: [], null: false
    t.jsonb "observations", default: [], null: false
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_project_deployments_on_owner_id"
    t.index ["project_deployment_series_id", "occurrence_key"], name: "idx_unique_deployment_occurrence", unique: true
    t.index ["project_deployment_series_id"], name: "idx_deployments_series"
    t.index ["project_environment_id"], name: "index_project_deployments_on_project_environment_id"
    t.index ["project_id", "scheduled_at"], name: "index_project_deployments_on_project_id_and_scheduled_at"
    t.index ["project_id"], name: "index_project_deployments_on_project_id"
    t.index ["verified_by_id"], name: "index_project_deployments_on_verified_by_id"
    t.index ["workspace_id"], name: "index_project_deployments_on_workspace_id"
  end

  create_table "project_environments", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.string "name", null: false
    t.string "url"
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["project_id", "name"], name: "index_project_environments_on_project_id_and_name", unique: true
    t.index ["project_id"], name: "index_project_environments_on_project_id"
    t.index ["workspace_id"], name: "index_project_environments_on_workspace_id"
  end

  create_table "project_operation_changes", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.bigint "actor_id"
    t.string "action", null: false
    t.string "item_kind"
    t.string "item_name"
    t.string "environment_name"
    t.jsonb "metadata", default: {}, null: false
    t.text "reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_id"], name: "index_project_operation_changes_on_actor_id"
    t.index ["project_id", "created_at"], name: "idx_operation_change_history"
    t.index ["project_id"], name: "index_project_operation_changes_on_project_id"
    t.index ["workspace_id"], name: "index_project_operation_changes_on_workspace_id"
  end

  create_table "project_operation_entries", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.bigint "project_operation_item_id", null: false
    t.bigint "project_environment_id", null: false
    t.bigint "updated_by_id"
    t.boolean "required", default: false, null: false
    t.text "encrypted_value"
    t.string "encrypted_value_iv"
    t.string "expected_version"
    t.string "observed_version"
    t.datetime "observed_at"
    t.string "source", default: "manual", null: false
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "verified_by_id"
    t.datetime "verified_at"
    t.index ["project_environment_id"], name: "idx_operation_entry_environment"
    t.index ["project_id"], name: "index_project_operation_entries_on_project_id"
    t.index ["project_operation_item_id", "project_environment_id"], name: "idx_operation_entry_identity", unique: true
    t.index ["project_operation_item_id"], name: "idx_operation_entry_item"
    t.index ["updated_by_id"], name: "index_project_operation_entries_on_updated_by_id"
    t.index ["verified_by_id"], name: "index_project_operation_entries_on_verified_by_id"
    t.index ["workspace_id"], name: "index_project_operation_entries_on_workspace_id"
  end

  create_table "project_operation_items", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "project_id", null: false
    t.string "kind", null: false
    t.string "name", null: false
    t.text "description"
    t.string "category"
    t.boolean "secret", default: true, null: false
    t.string "comparison", default: "environment_specific", null: false
    t.jsonb "details", default: {}, null: false
    t.text "encrypted_license_key"
    t.string "encrypted_license_key_iv"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["project_id", "kind", "name"], name: "idx_operation_item_identity", unique: true
    t.index ["project_id"], name: "index_project_operation_items_on_project_id"
    t.index ["workspace_id"], name: "index_project_operation_items_on_workspace_id"
  end

  create_table "project_users", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "collaborator", null: false
    t.string "status", default: "active", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "allocation_percentage", default: 0, null: false
    t.string "workload_status", default: "partial", null: false
    t.bigint "workspace_id", null: false
    t.index ["project_id", "user_id"], name: "index_project_users_on_project_id_and_user_id", unique: true
    t.index ["project_id"], name: "index_project_users_on_project_id"
    t.index ["user_id"], name: "index_project_users_on_user_id"
    t.index ["workspace_id"], name: "index_project_users_on_workspace_id"
  end

  create_table "project_vault_items", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.bigint "project_environment_id"
    t.string "title", null: false
    t.string "category"
    t.text "content", null: false
    t.string "username"
    t.jsonb "metadata", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["project_environment_id"], name: "index_project_vault_items_on_project_environment_id"
    t.index ["project_id", "category"], name: "index_project_vault_items_on_project_id_and_category"
    t.index ["project_id"], name: "index_project_vault_items_on_project_id"
    t.index ["workspace_id"], name: "index_project_vault_items_on_workspace_id"
  end

  create_table "projects", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.bigint "owner_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.date "start_date"
    t.date "end_date"
    t.string "status", default: "running"
    t.boolean "sheet_integration_enabled", default: false
    t.string "sheet_id"
    t.boolean "qa_mode_enabled", default: false, null: false
    t.string "issue_sheet_id"
    t.string "issue_sheet_name", default: "Issue Tracker", null: false
    t.bigint "workspace_id", null: false
    t.bigint "operations_revision", default: 0, null: false
    t.index ["owner_id"], name: "index_projects_on_owner_id"
    t.index ["workspace_id", "name"], name: "index_projects_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_projects_on_workspace_id"
  end

  create_table "push_deliveries", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "recipient_id", null: false
    t.bigint "mobile_device_id", null: false
    t.bigint "notification_id"
    t.string "source_type"
    t.bigint "source_id"
    t.string "event_type", null: false
    t.string "deduplication_key", null: false
    t.string "status", default: "queued", null: false
    t.string "expo_ticket_id"
    t.integer "attempt_count", default: 0, null: false
    t.string "last_error_code"
    t.string "last_error_message"
    t.datetime "sent_at"
    t.datetime "receipt_checked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["deduplication_key"], name: "index_push_deliveries_on_deduplication_key", unique: true
    t.index ["expo_ticket_id"], name: "index_push_deliveries_on_expo_ticket_id", unique: true, where: "(expo_ticket_id IS NOT NULL)"
    t.index ["mobile_device_id"], name: "index_push_deliveries_on_mobile_device_id"
    t.index ["notification_id"], name: "index_push_deliveries_on_notification_id"
    t.index ["recipient_id"], name: "index_push_deliveries_on_recipient_id"
    t.index ["source_type", "source_id"], name: "index_push_deliveries_on_source_type_and_source_id"
    t.index ["status", "created_at"], name: "index_push_deliveries_on_status_and_created_at"
    t.index ["workspace_id"], name: "index_push_deliveries_on_workspace_id"
  end

  create_table "roles", force: :cascade do |t|
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_roles_on_name", unique: true
  end

  create_table "scheduled_chat_messages", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "conversation_id", null: false
    t.bigint "user_id", null: false
    t.text "body"
    t.bigint "reply_to_id"
    t.string "client_id", null: false
    t.datetime "send_at", null: false
    t.string "state", default: "pending", null: false
    t.bigint "sent_message_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_id", "user_id", "client_id"], name: "index_scheduled_chat_messages_identity", unique: true
    t.index ["conversation_id"], name: "index_scheduled_chat_messages_on_conversation_id"
    t.index ["reply_to_id"], name: "index_scheduled_chat_messages_on_reply_to_id"
    t.index ["sent_message_id"], name: "index_scheduled_chat_messages_on_sent_message_id"
    t.index ["state", "send_at"], name: "index_scheduled_chat_messages_on_state_and_send_at"
    t.index ["user_id"], name: "index_scheduled_chat_messages_on_user_id"
    t.index ["workspace_id"], name: "index_scheduled_chat_messages_on_workspace_id"
  end

  create_table "scheduled_meetings", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "organizer_id", null: false
    t.bigint "call_session_id"
    t.string "title", null: false
    t.text "description"
    t.string "call_type", default: "video", null: false
    t.datetime "starts_at", null: false
    t.datetime "ends_at", null: false
    t.string "status", default: "scheduled", null: false
    t.integer "lock_version", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["call_session_id"], name: "index_scheduled_meetings_on_call_session_id", unique: true
    t.index ["organizer_id"], name: "index_scheduled_meetings_on_organizer_id"
    t.index ["workspace_id"], name: "index_scheduled_meetings_on_workspace_id"
  end

  create_table "skill_endorsements", force: :cascade do |t|
    t.bigint "user_skill_id", null: false
    t.bigint "endorser_id", null: false
    t.bigint "team_id"
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["endorser_id", "user_skill_id"], name: "index_skill_endorsements_on_endorser_and_user_skill", unique: true
    t.index ["endorser_id"], name: "index_skill_endorsements_on_endorser_id"
    t.index ["team_id"], name: "index_skill_endorsements_on_team_id"
    t.index ["user_skill_id"], name: "index_skill_endorsements_on_user_skill_id"
    t.index ["workspace_id"], name: "index_skill_endorsements_on_workspace_id"
  end

  create_table "skills", force: :cascade do |t|
    t.string "name", null: false
    t.string "category"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_skills_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_skills_on_workspace_id"
  end

  create_table "sprints", force: :cascade do |t|
    t.string "name", null: false
    t.date "start_date", null: false
    t.date "end_date", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "status", default: "todo"
    t.integer "progress", default: 0
    t.integer "created_by"
    t.integer "updated_by"
    t.bigint "project_id", null: false
    t.integer "working_days_mask", default: 62, null: false
    t.bigint "workspace_id", null: false
    t.index ["end_date"], name: "index_sprints_on_end_date"
    t.index ["project_id"], name: "index_sprints_on_project_id"
    t.index ["start_date"], name: "index_sprints_on_start_date"
    t.index ["working_days_mask"], name: "index_sprints_on_working_days_mask"
    t.index ["workspace_id"], name: "index_sprints_on_workspace_id"
  end

  create_table "support_access_grants", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "approved_by_id"
    t.bigint "support_user_id"
    t.text "reason", null: false
    t.jsonb "resources", default: [], null: false
    t.datetime "expires_at", null: false
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["approved_by_id"], name: "index_support_access_grants_on_approved_by_id"
    t.index ["support_user_id", "expires_at"], name: "index_support_access_grants_on_support_user_id_and_expires_at"
    t.index ["support_user_id"], name: "index_support_access_grants_on_support_user_id"
    t.index ["workspace_id"], name: "index_support_access_grants_on_workspace_id"
  end

  create_table "task_logs", force: :cascade do |t|
    t.bigint "task_id", null: false
    t.bigint "developer_id", null: false
    t.date "log_date", null: false
    t.string "type", default: "code"
    t.decimal "hours_logged", precision: 5, scale: 2, null: false
    t.string "status", default: "todo"
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["developer_id"], name: "index_task_logs_on_developer_id"
    t.index ["log_date"], name: "index_task_logs_on_log_date"
    t.index ["task_id"], name: "index_task_logs_on_task_id"
    t.index ["workspace_id"], name: "index_task_logs_on_workspace_id"
  end

  create_table "tasks", force: :cascade do |t|
    t.string "task_id"
    t.string "task_url"
    t.string "type", null: false
    t.decimal "estimated_hours", precision: 5, scale: 2
    t.bigint "sprint_id"
    t.bigint "developer_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "status", default: "todo"
    t.integer "order", default: 0
    t.integer "assigned_to_user"
    t.integer "created_by"
    t.integer "updated_by"
    t.string "title"
    t.text "description"
    t.date "start_date"
    t.date "end_date"
    t.bigint "project_id"
    t.string "qa_assigned"
    t.string "internal_qa"
    t.boolean "blocker", default: false, null: false
    t.boolean "demo", default: false, null: false
    t.decimal "swag_point", precision: 6, scale: 2
    t.decimal "story_point", precision: 6, scale: 2
    t.decimal "dev_hours", precision: 6, scale: 2
    t.decimal "code_review_hours", precision: 6, scale: 2
    t.decimal "dev_to_qa_hours", precision: 6, scale: 2
    t.decimal "qa_hours", precision: 6, scale: 2
    t.decimal "automation_qa_hours", precision: 6, scale: 2
    t.decimal "total_hours", precision: 6, scale: 2
    t.string "priority"
    t.bigint "workspace_id", null: false
    t.index ["developer_id"], name: "index_tasks_on_developer_id"
    t.index ["project_id"], name: "index_tasks_on_project_id"
    t.index ["sprint_id"], name: "index_tasks_on_sprint_id"
    t.index ["type"], name: "index_tasks_on_type"
    t.index ["workspace_id", "assigned_to_user", "end_date"], name: "index_tasks_on_workspace_assignee_end_date"
    t.index ["workspace_id", "end_date"], name: "index_tasks_on_workspace_id_and_end_date"
    t.index ["workspace_id", "project_id", "end_date"], name: "index_tasks_on_workspace_project_end_date"
    t.index ["workspace_id", "sprint_id", "developer_id", "order"], name: "index_tasks_on_workspace_sprint_developer_order"
    t.index ["workspace_id"], name: "index_tasks_on_workspace_id"
  end

  create_table "team_users", force: :cascade do |t|
    t.bigint "team_id", null: false
    t.bigint "user_id", null: false
    t.string "role", default: "member", null: false
    t.string "status", default: "pending", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["team_id", "user_id"], name: "index_team_users_on_team_id_and_user_id", unique: true
    t.index ["team_id"], name: "index_team_users_on_team_id"
    t.index ["user_id"], name: "index_team_users_on_user_id"
    t.index ["workspace_id"], name: "index_team_users_on_workspace_id"
  end

  create_table "teams", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.bigint "owner_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["owner_id"], name: "index_teams_on_owner_id"
    t.index ["workspace_id", "name"], name: "index_teams_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_teams_on_workspace_id"
  end

  create_table "topic_follows", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "topic_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["topic_id"], name: "index_topic_follows_on_topic_id"
    t.index ["user_id", "topic_id"], name: "index_topic_follows_on_user_id_and_topic_id", unique: true
    t.index ["user_id"], name: "index_topic_follows_on_user_id"
    t.index ["workspace_id"], name: "index_topic_follows_on_workspace_id"
  end

  create_table "topics", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.integer "topic_follows_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_topics_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_topics_on_workspace_id"
  end

  create_table "user_roles", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "role_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["role_id"], name: "index_user_roles_on_role_id"
    t.index ["user_id", "role_id"], name: "index_user_roles_on_user_id_and_role_id", unique: true
    t.index ["user_id"], name: "index_user_roles_on_user_id"
    t.index ["workspace_id"], name: "index_user_roles_on_workspace_id"
  end

  create_table "user_skills", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "skill_id", null: false
    t.string "proficiency", default: "beginner", null: false
    t.integer "endorsements_count", default: 0, null: false
    t.datetime "last_endorsed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["skill_id"], name: "index_user_skills_on_skill_id"
    t.index ["user_id", "skill_id"], name: "index_user_skills_on_user_id_and_skill_id", unique: true
    t.index ["user_id"], name: "index_user_skills_on_user_id"
    t.index ["workspace_id"], name: "index_user_skills_on_workspace_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "jti"
    t.string "first_name"
    t.string "last_name"
    t.date "date_of_birth"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "confirmation_sent_at"
    t.string "unconfirmed_email"
    t.string "status", default: "new", null: false
    t.string "color_theme", default: "blue"
    t.boolean "dark_mode", default: false, null: false
    t.string "landing_page", default: "posts"
    t.string "availability_status", default: "available_now", null: false
    t.integer "current_projects_count", default: 0, null: false
    t.string "job_title", default: "Team Member", null: false
    t.bigint "department_id"
    t.jsonb "notification_preferences", default: {"digest"=>false, "update"=>true, "assigned"=>true, "commented"=>true}, null: false
    t.string "keka_base_url"
    t.string "keka_employee_id"
    t.jsonb "keka_profile_data", default: {}, null: false
    t.datetime "keka_last_synced_at"
    t.string "phone_number"
    t.text "bio"
    t.jsonb "social_links", default: {}, null: false
    t.datetime "last_seen_at"
    t.string "avatar_color"
    t.string "encrypted_keka_api_key"
    t.string "encrypted_keka_api_key_iv"
    t.bigint "workspace_id", null: false
    t.boolean "demo_account", default: false, null: false
    t.boolean "site_admin", default: false, null: false
    t.jsonb "push_notification_settings", default: {}, null: false
    t.jsonb "home_preferences", default: {}, null: false
    t.datetime "deleted_at"
    t.string "department_role", default: "member", null: false
    t.text "mfa_secret_ciphertext"
    t.text "mfa_pending_secret_ciphertext"
    t.datetime "mfa_pending_expires_at"
    t.datetime "mfa_enabled_at"
    t.bigint "mfa_last_otp_at"
    t.jsonb "mfa_recovery_digests", default: [], null: false
    t.integer "mfa_failed_attempts", default: 0, null: false
    t.datetime "mfa_locked_until"
    t.text "keka_secret_ciphertext"
    t.boolean "system_bot", default: false, null: false
    t.index ["availability_status"], name: "index_users_on_availability_status"
    t.index ["confirmation_token"], name: "index_users_on_confirmation_token", unique: true
    t.index ["department_id"], name: "index_users_on_department_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["id", "workspace_id"], name: "index_users_for_workspace_membership", unique: true
    t.index ["last_seen_at"], name: "index_users_on_last_seen_at"
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
    t.index ["workspace_id", "created_at"], name: "index_users_on_workspace_id_and_created_at"
    t.index ["workspace_id"], name: "index_one_system_bot_per_workspace", unique: true, where: "(system_bot = true)"
    t.index ["workspace_id"], name: "index_users_on_workspace_id"
    t.check_constraint "department_role::text = ANY (ARRAY['member'::character varying, 'manager'::character varying]::text[])", name: "users_department_role_valid"
  end

  create_table "web_sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "password_fingerprint", null: false
    t.datetime "expires_at", null: false
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "primary_verified_at"
    t.datetime "mfa_verified_at"
    t.index ["expires_at"], name: "index_web_sessions_on_expires_at"
    t.index ["user_id"], name: "index_web_sessions_on_user_id"
  end

  create_table "work_categories", force: :cascade do |t|
    t.string "name", null: false
    t.string "color"
    t.string "hex"
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_categories_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_categories_on_workspace_id"
  end

  create_table "work_log_tags", force: :cascade do |t|
    t.bigint "work_log_id", null: false
    t.bigint "work_tag_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["work_log_id", "work_tag_id"], name: "index_work_log_tags_on_work_log_id_and_work_tag_id", unique: true
    t.index ["work_log_id"], name: "index_work_log_tags_on_work_log_id"
    t.index ["work_tag_id"], name: "index_work_log_tags_on_work_tag_id"
    t.index ["workspace_id"], name: "index_work_log_tags_on_workspace_id"
  end

  create_table "work_logs", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.date "log_date", null: false
    t.time "start_time", null: false
    t.time "end_time", null: false
    t.string "title", null: false
    t.text "description"
    t.bigint "category_id"
    t.bigint "priority_id"
    t.integer "actual_minutes", default: 0
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["category_id"], name: "index_work_logs_on_category_id"
    t.index ["priority_id"], name: "index_work_logs_on_priority_id"
    t.index ["user_id", "log_date"], name: "index_work_logs_on_user_id_and_log_date"
    t.index ["user_id"], name: "index_work_logs_on_user_id"
    t.index ["workspace_id"], name: "index_work_logs_on_workspace_id"
  end

  create_table "work_notes", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.date "note_date", null: false
    t.text "content"
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["user_id", "note_date"], name: "index_work_notes_on_user_id_and_note_date", unique: true
    t.index ["user_id"], name: "index_work_notes_on_user_id"
    t.index ["workspace_id"], name: "index_work_notes_on_workspace_id"
  end

  create_table "work_priorities", force: :cascade do |t|
    t.string "name", null: false
    t.string "color"
    t.string "hex"
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_priorities_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_priorities_on_workspace_id"
  end

  create_table "work_tags", force: :cascade do |t|
    t.string "name", null: false
    t.integer "created_by"
    t.integer "updated_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_tags_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_tags_on_workspace_id"
  end

  create_table "workspace_access_events", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "actor_id"
    t.bigint "subject_id"
    t.string "action", null: false
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_id"], name: "index_workspace_access_events_on_actor_id"
    t.index ["subject_id"], name: "index_workspace_access_events_on_subject_id"
    t.index ["workspace_id", "created_at"], name: "index_workspace_access_events_on_workspace_id_and_created_at"
    t.index ["workspace_id"], name: "index_workspace_access_events_on_workspace_id"
  end

  create_table "workspace_integrations", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.string "provider", null: false
    t.text "secret_ciphertext"
    t.jsonb "public_settings", default: {}, null: false
    t.datetime "revoked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["workspace_id", "provider"], name: "index_workspace_integrations_on_workspace_id_and_provider", unique: true
    t.index ["workspace_id"], name: "index_workspace_integrations_on_workspace_id"
    t.check_constraint "provider::text = ANY (ARRAY['google_sheets'::character varying, 'slack'::character varying]::text[])", name: "workspace_integrations_provider"
  end

  create_table "workspace_invitations", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "invited_by_id", null: false
    t.bigint "accepted_user_id"
    t.bigint "department_id"
    t.string "email", null: false
    t.string "token_digest", null: false
    t.string "status", default: "pending", null: false
    t.jsonb "role_names", default: ["member"], null: false
    t.jsonb "project_ids", default: [], null: false
    t.datetime "expires_at", null: false
    t.datetime "accepted_at"
    t.datetime "revoked_at"
    t.datetime "last_sent_at"
    t.string "delivery_status", default: "queued", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["accepted_user_id"], name: "index_workspace_invitations_on_accepted_user_id"
    t.index ["department_id"], name: "index_workspace_invitations_on_department_id"
    t.index ["invited_by_id"], name: "index_workspace_invitations_on_invited_by_id"
    t.index ["token_digest"], name: "index_workspace_invitations_on_token_digest", unique: true
    t.index ["workspace_id", "email"], name: "index_pending_workspace_invitation_email", unique: true, where: "((status)::text = 'pending'::text)"
    t.index ["workspace_id"], name: "index_workspace_invitations_on_workspace_id"
    t.check_constraint "status::text = ANY (ARRAY['pending'::character varying, 'accepted'::character varying, 'revoked'::character varying, 'expired'::character varying]::text[])", name: "workspace_invitation_status"
  end

  create_table "workspace_memberships", force: :cascade do |t|
    t.bigint "workspace_id", null: false
    t.bigint "user_id", null: false
    t.string "status", default: "active", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "offboarded_at"
    t.bigint "offboarded_by_id"
    t.index ["offboarded_by_id"], name: "index_workspace_memberships_on_offboarded_by_id"
    t.index ["user_id", "workspace_id"], name: "index_workspace_memberships_on_user_id_and_workspace_id", unique: true
    t.index ["user_id"], name: "index_workspace_memberships_on_user_id", unique: true
    t.index ["workspace_id"], name: "index_workspace_memberships_on_workspace_id"
    t.check_constraint "status::text = ANY (ARRAY['active'::character varying, 'suspended'::character varying]::text[])", name: "workspace_membership_status"
  end

  create_table "workspaces", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "kind", default: "private", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "plan_key", default: "starter", null: false
    t.string "billing_status", default: "trialing", null: false
    t.datetime "trial_ends_at"
    t.integer "seat_limit_override"
    t.jsonb "module_overrides", default: {}, null: false
    t.index ["billing_status"], name: "index_workspaces_on_billing_status"
    t.index ["plan_key"], name: "index_workspaces_on_plan_key"
    t.index ["slug"], name: "index_workspaces_on_slug", unique: true
  end

  add_foreign_key "account_deletion_requests", "users"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "billing_subscriptions", "workspaces"
  add_foreign_key "calendar_events", "projects"
  add_foreign_key "calendar_events", "scheduled_meetings", on_delete: :nullify
  add_foreign_key "calendar_events", "sprints"
  add_foreign_key "calendar_events", "tasks"
  add_foreign_key "calendar_events", "users"
  add_foreign_key "calendar_events", "workspaces"
  add_foreign_key "call_participants", "call_sessions"
  add_foreign_key "call_participants", "users"
  add_foreign_key "call_participants", "workspaces"
  add_foreign_key "call_sessions", "conversations"
  add_foreign_key "call_sessions", "users", column: "host_id", on_delete: :nullify
  add_foreign_key "call_sessions", "users", column: "initiator_id"
  add_foreign_key "call_sessions", "workspaces"
  add_foreign_key "comments", "posts"
  add_foreign_key "comments", "users"
  add_foreign_key "comments", "workspaces"
  add_foreign_key "conversation_participants", "conversations"
  add_foreign_key "conversation_participants", "users"
  add_foreign_key "conversation_participants", "workspaces"
  add_foreign_key "conversations", "messages", column: "last_message_id"
  add_foreign_key "conversations", "users", column: "creator_id"
  add_foreign_key "conversations", "workspaces"
  add_foreign_key "department_comments", "department_entries"
  add_foreign_key "department_comments", "users", column: "author_id"
  add_foreign_key "department_comments", "workspaces"
  add_foreign_key "department_entries", "departments"
  add_foreign_key "department_entries", "users", column: "author_id"
  add_foreign_key "department_entries", "workspaces"
  add_foreign_key "department_join_requests", "departments"
  add_foreign_key "department_join_requests", "departments", column: "source_department_id"
  add_foreign_key "department_join_requests", "users"
  add_foreign_key "department_join_requests", "users", column: "source_approver_id"
  add_foreign_key "department_join_requests", "users", column: "target_approver_id"
  add_foreign_key "department_join_requests", "workspaces"
  add_foreign_key "departments", "users", column: "manager_id"
  add_foreign_key "departments", "workspaces"
  add_foreign_key "event_reminders", "calendar_events"
  add_foreign_key "event_reminders", "workspaces"
  add_foreign_key "friendships", "users", column: "followed_id"
  add_foreign_key "friendships", "users", column: "follower_id"
  add_foreign_key "friendships", "workspaces"
  add_foreign_key "issues", "projects"
  add_foreign_key "issues", "users", column: "assignee_user_id"
  add_foreign_key "issues", "users", column: "reporter_id"
  add_foreign_key "issues", "workspaces"
  add_foreign_key "items", "users"
  add_foreign_key "items", "workspaces"
  add_foreign_key "knowledge_bookmarks", "users"
  add_foreign_key "knowledge_bookmarks", "workspaces"
  add_foreign_key "knowledge_items", "knowledge_items", column: "replaced_by_id"
  add_foreign_key "knowledge_items", "knowledge_prompt_runs"
  add_foreign_key "knowledge_items", "users"
  add_foreign_key "knowledge_items", "workspaces"
  add_foreign_key "knowledge_prompt_runs", "mcp_access_tokens"
  add_foreign_key "knowledge_prompt_runs", "users"
  add_foreign_key "knowledge_prompt_runs", "workspaces"
  add_foreign_key "learning_checkpoints", "learning_goals"
  add_foreign_key "learning_checkpoints", "workspaces"
  add_foreign_key "learning_goals", "teams"
  add_foreign_key "learning_goals", "users"
  add_foreign_key "learning_goals", "workspaces"
  add_foreign_key "mcp_access_tokens", "users"
  add_foreign_key "mcp_access_tokens", "workspaces"
  add_foreign_key "mcp_audit_logs", "mcp_access_tokens"
  add_foreign_key "mcp_audit_logs", "users"
  add_foreign_key "mcp_audit_logs", "workspaces"
  add_foreign_key "meeting_invitations", "calendar_events", on_delete: :nullify
  add_foreign_key "meeting_invitations", "scheduled_meetings"
  add_foreign_key "meeting_invitations", "users"
  add_foreign_key "meeting_invitations", "workspaces"
  add_foreign_key "message_reactions", "messages"
  add_foreign_key "message_reactions", "users"
  add_foreign_key "message_reactions", "workspaces"
  add_foreign_key "messages", "conversations"
  add_foreign_key "messages", "messages", column: "reply_to_id", on_delete: :nullify
  add_foreign_key "messages", "users"
  add_foreign_key "messages", "users", column: "pinned_by_id", on_delete: :nullify
  add_foreign_key "messages", "workspaces"
  add_foreign_key "mobile_devices", "mobile_sessions"
  add_foreign_key "mobile_devices", "users"
  add_foreign_key "mobile_devices", "workspaces"
  add_foreign_key "mobile_sessions", "users"
  add_foreign_key "mobile_sessions", "users", column: "impersonated_user_id"
  add_foreign_key "mobile_sessions", "workspaces"
  add_foreign_key "notifications", "users", column: "actor_id"
  add_foreign_key "notifications", "users", column: "recipient_id"
  add_foreign_key "notifications", "workspaces"
  add_foreign_key "operation_reminder_deliveries", "notifications", on_delete: :nullify
  add_foreign_key "operation_reminder_deliveries", "projects"
  add_foreign_key "operation_reminder_deliveries", "users", column: "recipient_id", on_delete: :cascade
  add_foreign_key "operation_reminder_deliveries", "workspaces"
  add_foreign_key "pdf_document_artifacts", "pdf_document_operations"
  add_foreign_key "pdf_document_artifacts", "pdf_documents"
  add_foreign_key "pdf_document_artifacts", "users"
  add_foreign_key "pdf_document_artifacts", "workspaces"
  add_foreign_key "pdf_document_edit_layers", "pdf_documents"
  add_foreign_key "pdf_document_edit_layers", "workspaces"
  add_foreign_key "pdf_document_operations", "pdf_document_versions", column: "base_version_id", on_delete: :nullify
  add_foreign_key "pdf_document_operations", "pdf_documents"
  add_foreign_key "pdf_document_operations", "users"
  add_foreign_key "pdf_document_operations", "workspaces"
  add_foreign_key "pdf_document_versions", "pdf_document_edit_layers", column: "edit_layer_id"
  add_foreign_key "pdf_document_versions", "pdf_document_versions", column: "parent_version_id", on_delete: :nullify
  add_foreign_key "pdf_document_versions", "pdf_documents"
  add_foreign_key "pdf_document_versions", "users", column: "created_by_id"
  add_foreign_key "pdf_document_versions", "workspaces"
  add_foreign_key "pdf_documents", "pdf_document_versions", column: "current_version_id", on_delete: :nullify
  add_foreign_key "pdf_documents", "users"
  add_foreign_key "pdf_documents", "workspaces"
  add_foreign_key "portfolio_features", "portfolio_projects"
  add_foreign_key "post_likes", "posts"
  add_foreign_key "post_likes", "users"
  add_foreign_key "post_likes", "workspaces"
  add_foreign_key "posts", "users"
  add_foreign_key "posts", "workspaces"
  add_foreign_key "privacy_request_events", "privacy_requests"
  add_foreign_key "privacy_request_events", "users", column: "actor_id", on_delete: :nullify
  add_foreign_key "project_deployment_series", "project_environments"
  add_foreign_key "project_deployment_series", "projects"
  add_foreign_key "project_deployment_series", "users", column: "owner_id"
  add_foreign_key "project_deployment_series", "workspaces"
  add_foreign_key "project_deployments", "project_deployment_series"
  add_foreign_key "project_deployments", "project_environments"
  add_foreign_key "project_deployments", "projects"
  add_foreign_key "project_deployments", "users", column: "owner_id"
  add_foreign_key "project_deployments", "users", column: "verified_by_id", on_delete: :nullify
  add_foreign_key "project_deployments", "workspaces"
  add_foreign_key "project_environments", "projects"
  add_foreign_key "project_environments", "workspaces"
  add_foreign_key "project_operation_changes", "projects"
  add_foreign_key "project_operation_changes", "users", column: "actor_id", on_delete: :nullify
  add_foreign_key "project_operation_changes", "workspaces"
  add_foreign_key "project_operation_entries", "project_environments"
  add_foreign_key "project_operation_entries", "project_operation_items"
  add_foreign_key "project_operation_entries", "projects"
  add_foreign_key "project_operation_entries", "users", column: "updated_by_id", on_delete: :nullify
  add_foreign_key "project_operation_entries", "users", column: "verified_by_id", on_delete: :nullify
  add_foreign_key "project_operation_entries", "workspaces"
  add_foreign_key "project_operation_items", "projects"
  add_foreign_key "project_operation_items", "workspaces"
  add_foreign_key "project_users", "projects"
  add_foreign_key "project_users", "users"
  add_foreign_key "project_users", "workspaces"
  add_foreign_key "project_vault_items", "project_environments"
  add_foreign_key "project_vault_items", "projects"
  add_foreign_key "project_vault_items", "workspaces"
  add_foreign_key "projects", "users", column: "owner_id"
  add_foreign_key "projects", "workspaces"
  add_foreign_key "push_deliveries", "mobile_devices"
  add_foreign_key "push_deliveries", "notifications", on_delete: :nullify
  add_foreign_key "push_deliveries", "users", column: "recipient_id"
  add_foreign_key "push_deliveries", "workspaces"
  add_foreign_key "scheduled_chat_messages", "conversations"
  add_foreign_key "scheduled_chat_messages", "messages", column: "reply_to_id", on_delete: :nullify
  add_foreign_key "scheduled_chat_messages", "messages", column: "sent_message_id", on_delete: :nullify
  add_foreign_key "scheduled_chat_messages", "users"
  add_foreign_key "scheduled_chat_messages", "workspaces"
  add_foreign_key "scheduled_meetings", "call_sessions"
  add_foreign_key "scheduled_meetings", "users", column: "organizer_id"
  add_foreign_key "scheduled_meetings", "workspaces"
  add_foreign_key "skill_endorsements", "teams"
  add_foreign_key "skill_endorsements", "user_skills"
  add_foreign_key "skill_endorsements", "users", column: "endorser_id"
  add_foreign_key "skill_endorsements", "workspaces"
  add_foreign_key "skills", "workspaces"
  add_foreign_key "sprints", "projects"
  add_foreign_key "sprints", "workspaces"
  add_foreign_key "support_access_grants", "users", column: "approved_by_id", on_delete: :nullify
  add_foreign_key "support_access_grants", "users", column: "support_user_id", on_delete: :nullify
  add_foreign_key "support_access_grants", "users", column: ["approved_by_id", "workspace_id"], primary_key: ["id", "workspace_id"], name: "fk_support_approver_workspace"
  add_foreign_key "support_access_grants", "workspaces"
  add_foreign_key "task_logs", "tasks"
  add_foreign_key "task_logs", "users", column: "developer_id"
  add_foreign_key "task_logs", "workspaces"
  add_foreign_key "tasks", "projects"
  add_foreign_key "tasks", "sprints"
  add_foreign_key "tasks", "users", column: "developer_id"
  add_foreign_key "tasks", "workspaces"
  add_foreign_key "team_users", "teams"
  add_foreign_key "team_users", "users"
  add_foreign_key "team_users", "workspaces"
  add_foreign_key "teams", "users", column: "owner_id"
  add_foreign_key "teams", "workspaces"
  add_foreign_key "topic_follows", "topics"
  add_foreign_key "topic_follows", "users"
  add_foreign_key "topic_follows", "workspaces"
  add_foreign_key "topics", "workspaces"
  add_foreign_key "user_roles", "roles"
  add_foreign_key "user_roles", "users"
  add_foreign_key "user_roles", "workspace_memberships", column: ["user_id", "workspace_id"], primary_key: ["user_id", "workspace_id"], name: "fk_user_roles_workspace_membership", on_delete: :cascade
  add_foreign_key "user_roles", "workspaces"
  add_foreign_key "user_skills", "skills"
  add_foreign_key "user_skills", "users"
  add_foreign_key "user_skills", "workspaces"
  add_foreign_key "users", "departments"
  add_foreign_key "users", "workspaces"
  add_foreign_key "web_sessions", "users"
  add_foreign_key "work_categories", "workspaces"
  add_foreign_key "work_log_tags", "work_logs"
  add_foreign_key "work_log_tags", "work_tags"
  add_foreign_key "work_log_tags", "workspaces"
  add_foreign_key "work_logs", "users"
  add_foreign_key "work_logs", "work_categories", column: "category_id"
  add_foreign_key "work_logs", "work_priorities", column: "priority_id"
  add_foreign_key "work_logs", "workspaces"
  add_foreign_key "work_notes", "users"
  add_foreign_key "work_notes", "workspaces"
  add_foreign_key "work_priorities", "workspaces"
  add_foreign_key "work_tags", "workspaces"
  add_foreign_key "workspace_access_events", "users", column: "actor_id", on_delete: :nullify
  add_foreign_key "workspace_access_events", "users", column: "subject_id", on_delete: :nullify
  add_foreign_key "workspace_access_events", "workspaces"
  add_foreign_key "workspace_integrations", "workspaces"
  add_foreign_key "workspace_invitations", "departments", on_delete: :nullify
  add_foreign_key "workspace_invitations", "users", column: "accepted_user_id", on_delete: :nullify
  add_foreign_key "workspace_invitations", "users", column: "invited_by_id"
  add_foreign_key "workspace_invitations", "workspaces"
  add_foreign_key "workspace_memberships", "users"
  add_foreign_key "workspace_memberships", "users", column: "offboarded_by_id", on_delete: :nullify
  add_foreign_key "workspace_memberships", "users", column: ["user_id", "workspace_id"], primary_key: ["id", "workspace_id"], name: "fk_membership_home_workspace", on_delete: :cascade
  add_foreign_key "workspace_memberships", "workspaces"
end
