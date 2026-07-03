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

ActiveRecord::Schema[8.1].define(version: 2027_06_29_000000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "calendar_events", force: :cascade do |t|
    t.boolean "all_day", default: false, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.datetime "end_at", null: false
    t.string "event_type", default: "meeting", null: false
    t.string "external_id"
    t.string "external_source"
    t.string "location_or_meet_link"
    t.bigint "project_id"
    t.bigint "recurrence_parent_id"
    t.string "recurrence_rule", default: "none", null: false
    t.datetime "recurrence_until"
    t.bigint "sprint_id"
    t.datetime "start_at", null: false
    t.string "status", default: "scheduled", null: false
    t.bigint "task_id"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "visibility", default: "personal", null: false
    t.bigint "workspace_id", null: false
    t.index ["event_type"], name: "index_calendar_events_on_event_type"
    t.index ["external_source", "external_id"], name: "index_calendar_events_on_external_source_and_external_id"
    t.index ["project_id"], name: "index_calendar_events_on_project_id"
    t.index ["recurrence_parent_id"], name: "index_calendar_events_on_recurrence_parent_id"
    t.index ["sprint_id"], name: "index_calendar_events_on_sprint_id"
    t.index ["task_id"], name: "index_calendar_events_on_task_id"
    t.index ["user_id", "start_at"], name: "index_calendar_events_on_user_id_and_start_at"
    t.index ["user_id"], name: "index_calendar_events_on_user_id"
    t.index ["visibility", "start_at"], name: "index_calendar_events_on_visibility_and_start_at"
    t.index ["workspace_id"], name: "index_calendar_events_on_workspace_id"
  end

  create_table "comments", force: :cascade do |t|
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.bigint "post_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["post_id", "created_at"], name: "index_comments_on_post_id_and_created_at"
    t.index ["post_id"], name: "index_comments_on_post_id"
    t.index ["user_id"], name: "index_comments_on_user_id"
    t.index ["workspace_id"], name: "index_comments_on_workspace_id"
  end

  create_table "contacts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.text "message", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "conversation_participants", force: :cascade do |t|
    t.bigint "conversation_id", null: false
    t.datetime "created_at", null: false
    t.datetime "hidden_at"
    t.datetime "last_read_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["conversation_id", "user_id"], name: "idx_unique_conversation_participant", unique: true
    t.index ["conversation_id"], name: "index_conversation_participants_on_conversation_id"
    t.index ["user_id", "hidden_at"], name: "index_conversation_participants_on_user_id_and_hidden_at"
    t.index ["user_id"], name: "index_conversation_participants_on_user_id"
    t.index ["workspace_id"], name: "index_conversation_participants_on_workspace_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.string "conversation_type", default: "direct", null: false
    t.datetime "created_at", null: false
    t.bigint "creator_id", null: false
    t.string "title"
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["conversation_type"], name: "index_conversations_on_conversation_type"
    t.index ["creator_id"], name: "index_conversations_on_creator_id"
    t.index ["workspace_id"], name: "index_conversations_on_workspace_id"
  end

  create_table "departments", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.bigint "manager_id"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["manager_id"], name: "index_departments_on_manager_id"
    t.index ["workspace_id", "name"], name: "index_departments_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_departments_on_workspace_id"
  end

  create_table "event_reminders", force: :cascade do |t|
    t.bigint "calendar_event_id", null: false
    t.string "channel", default: "in_app", null: false
    t.datetime "created_at", null: false
    t.integer "minutes_before", default: 10, null: false
    t.datetime "send_at", null: false
    t.datetime "sent_at"
    t.string "state", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["calendar_event_id", "minutes_before", "channel"], name: "idx_unique_event_reminder_window", unique: true
    t.index ["calendar_event_id"], name: "index_event_reminders_on_calendar_event_id"
    t.index ["state", "send_at"], name: "index_event_reminders_on_state_and_send_at"
    t.index ["workspace_id"], name: "index_event_reminders_on_workspace_id"
  end

  create_table "friendships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "followed_id", null: false
    t.bigint "follower_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["followed_id"], name: "index_friendships_on_followed_id"
    t.index ["follower_id", "followed_id"], name: "index_friendships_on_follower_id_and_followed_id", unique: true
    t.index ["follower_id"], name: "index_friendships_on_follower_id"
    t.index ["workspace_id"], name: "index_friendships_on_workspace_id"
  end

  create_table "issues", force: :cascade do |t|
    t.text "actual_result"
    t.string "assignee"
    t.string "assignee_email"
    t.string "assignee_slack"
    t.bigint "assignee_user_id"
    t.string "attachment"
    t.jsonb "attachment_urls", default: [], null: false
    t.string "category"
    t.text "comment"
    t.text "comment_qa"
    t.datetime "created_at", null: false
    t.text "dev_comments_dated"
    t.text "developer_comment"
    t.date "due_date"
    t.text "expected_result"
    t.string "found_by"
    t.date "found_on"
    t.text "issue_description"
    t.string "issue_key", null: false
    t.string "issue_present_in_rails4"
    t.string "local_qa"
    t.jsonb "media_urls", default: [], null: false
    t.string "mf6_app"
    t.string "module_name"
    t.string "owner"
    t.string "owner_email"
    t.text "pre_conditions"
    t.bigint "project_id", null: false
    t.bigint "reporter_id"
    t.text "repro_steps"
    t.string "section_detail"
    t.string "severity", default: "Medium", null: false
    t.string "sprint_name"
    t.string "status", default: "New", null: false
    t.string "sub_module"
    t.string "task_id"
    t.string "team_test"
    t.string "title", null: false
    t.datetime "updated_at", null: false
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
    t.string "category"
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["user_id"], name: "index_items_on_user_id"
    t.index ["workspace_id"], name: "index_items_on_workspace_id"
  end

  create_table "knowledge_bookmarks", force: :cascade do |t|
    t.string "card_type", null: false
    t.string "collection_name"
    t.datetime "created_at", null: false
    t.datetime "last_reminded_at"
    t.datetime "last_viewed_at"
    t.datetime "next_reminder_at"
    t.jsonb "payload", default: {}, null: false
    t.integer "reminder_interval_days", default: 7, null: false
    t.string "source_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["collection_name"], name: "index_knowledge_bookmarks_on_collection_name"
    t.index ["next_reminder_at"], name: "index_knowledge_bookmarks_on_next_reminder_at"
    t.index ["user_id", "card_type", "source_id"], name: "index_knowledge_bookmarks_on_identity", unique: true
    t.index ["user_id", "next_reminder_at"], name: "index_knowledge_bookmarks_on_user_next_reminder"
    t.index ["user_id"], name: "index_knowledge_bookmarks_on_user_id"
    t.index ["workspace_id"], name: "index_knowledge_bookmarks_on_workspace_id"
  end

  create_table "knowledge_items", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "archived_at"
    t.text "body"
    t.string "category", default: "learning", null: false
    t.string "collection_name"
    t.datetime "created_at", null: false
    t.string "item_type", default: "fact", null: false
    t.bigint "knowledge_prompt_run_id", null: false
    t.jsonb "payload", default: {}, null: false
    t.integer "position", default: 0, null: false
    t.datetime "published_at"
    t.bigint "replaced_by_id"
    t.string "source_key", null: false
    t.string "source_name"
    t.string "source_url"
    t.text "summary"
    t.jsonb "tags", default: [], null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
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
    t.datetime "created_at", null: false
    t.string "generation_mode", default: "history", null: false
    t.bigint "mcp_access_token_id"
    t.jsonb "metadata", default: {}, null: false
    t.text "prompt", null: false
    t.string "source", default: "mcp", null: false
    t.string "status", default: "completed", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["mcp_access_token_id"], name: "index_knowledge_prompt_runs_on_mcp_access_token_id"
    t.index ["user_id"], name: "index_knowledge_prompt_runs_on_user_id"
    t.index ["workspace_id", "generation_mode", "status"], name: "idx_knowledge_prompt_runs_mode_status"
    t.index ["workspace_id", "user_id", "created_at"], name: "idx_knowledge_prompt_runs_workspace_user_created"
    t.index ["workspace_id"], name: "index_knowledge_prompt_runs_on_workspace_id"
  end

  create_table "learning_checkpoints", force: :cascade do |t|
    t.boolean "completed", default: false, null: false
    t.datetime "created_at", null: false
    t.bigint "learning_goal_id", null: false
    t.string "resource_url"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["learning_goal_id"], name: "index_learning_checkpoints_on_learning_goal_id"
    t.index ["workspace_id"], name: "index_learning_checkpoints_on_workspace_id"
  end

  create_table "learning_goals", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.date "due_date"
    t.integer "progress", default: 0, null: false
    t.bigint "team_id"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["team_id"], name: "index_learning_goals_on_team_id"
    t.index ["user_id"], name: "index_learning_goals_on_user_id"
    t.index ["workspace_id"], name: "index_learning_goals_on_workspace_id"
  end

  create_table "mcp_access_tokens", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.datetime "last_used_at"
    t.string "name", null: false
    t.datetime "revoked_at"
    t.jsonb "scopes", default: [], null: false
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["revoked_at"], name: "index_mcp_access_tokens_on_revoked_at"
    t.index ["token_digest"], name: "index_mcp_access_tokens_on_token_digest", unique: true
    t.index ["user_id"], name: "index_mcp_access_tokens_on_user_id"
    t.index ["workspace_id", "user_id"], name: "index_mcp_access_tokens_on_workspace_id_and_user_id"
    t.index ["workspace_id"], name: "index_mcp_access_tokens_on_workspace_id"
  end

  create_table "mcp_audit_logs", force: :cascade do |t|
    t.string "action", null: false
    t.datetime "created_at", null: false
    t.bigint "mcp_access_token_id"
    t.jsonb "metadata", default: {}, null: false
    t.string "tool_name", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["mcp_access_token_id"], name: "index_mcp_audit_logs_on_mcp_access_token_id"
    t.index ["tool_name", "action"], name: "index_mcp_audit_logs_on_tool_name_and_action"
    t.index ["user_id"], name: "index_mcp_audit_logs_on_user_id"
    t.index ["workspace_id", "created_at"], name: "index_mcp_audit_logs_on_workspace_id_and_created_at"
    t.index ["workspace_id"], name: "index_mcp_audit_logs_on_workspace_id"
  end

  create_table "message_reactions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "emoji", null: false
    t.bigint "message_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["message_id", "user_id", "emoji"], name: "idx_unique_message_reaction", unique: true
    t.index ["message_id"], name: "index_message_reactions_on_message_id"
    t.index ["user_id"], name: "index_message_reactions_on_user_id"
    t.index ["workspace_id"], name: "index_message_reactions_on_workspace_id"
  end

  create_table "messages", force: :cascade do |t|
    t.text "body"
    t.bigint "conversation_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["conversation_id", "created_at"], name: "index_messages_on_conversation_id_and_created_at"
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
    t.index ["user_id"], name: "index_messages_on_user_id"
    t.index ["workspace_id"], name: "index_messages_on_workspace_id"
  end

  create_table "notifications", force: :cascade do |t|
    t.string "action"
    t.bigint "actor_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata"
    t.bigint "notifiable_id", null: false
    t.string "notifiable_type", null: false
    t.datetime "read_at"
    t.bigint "recipient_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["actor_id"], name: "index_notifications_on_actor_id"
    t.index ["notifiable_type", "notifiable_id"], name: "index_notifications_on_notifiable"
    t.index ["recipient_id", "read_at"], name: "index_notifications_on_recipient_id_and_read_at"
    t.index ["recipient_id"], name: "index_notifications_on_recipient_id"
    t.index ["workspace_id"], name: "index_notifications_on_workspace_id"
  end

  create_table "pdf_document_artifacts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "kind", null: false
    t.bigint "pdf_document_id"
    t.bigint "pdf_document_operation_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["expires_at"], name: "index_pdf_document_artifacts_on_expires_at"
    t.index ["pdf_document_id"], name: "index_pdf_document_artifacts_on_pdf_document_id"
    t.index ["pdf_document_operation_id"], name: "index_pdf_document_artifacts_on_pdf_document_operation_id"
    t.index ["user_id"], name: "index_pdf_document_artifacts_on_user_id"
    t.index ["workspace_id"], name: "index_pdf_document_artifacts_on_workspace_id"
  end

  create_table "pdf_document_operations", force: :cascade do |t|
    t.bigint "base_version_id"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.text "error_message"
    t.string "kind", null: false
    t.jsonb "parameters", default: {}, null: false
    t.bigint "pdf_document_id"
    t.integer "progress", default: 0, null: false
    t.jsonb "result", default: {}, null: false
    t.datetime "started_at"
    t.string "status", default: "queued", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["base_version_id"], name: "index_pdf_document_operations_on_base_version_id"
    t.index ["pdf_document_id"], name: "index_pdf_document_operations_on_pdf_document_id"
    t.index ["status", "created_at"], name: "index_pdf_document_operations_on_status_and_created_at"
    t.index ["user_id", "created_at"], name: "index_pdf_document_operations_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_pdf_document_operations_on_user_id"
    t.index ["workspace_id"], name: "index_pdf_document_operations_on_workspace_id"
  end

  create_table "pdf_document_versions", force: :cascade do |t|
    t.bigint "byte_size", default: 0, null: false
    t.datetime "created_at", null: false
    t.bigint "created_by_id", null: false
    t.boolean "encrypted", default: false, null: false
    t.jsonb "metadata", default: {}, null: false
    t.string "operation", null: false
    t.integer "page_count"
    t.bigint "parent_version_id"
    t.bigint "pdf_document_id", null: false
    t.datetime "updated_at", null: false
    t.integer "version_number", null: false
    t.bigint "workspace_id", null: false
    t.index ["created_by_id"], name: "index_pdf_document_versions_on_created_by_id"
    t.index ["pdf_document_id", "version_number"], name: "idx_pdf_document_versions_number", unique: true
    t.index ["pdf_document_id"], name: "index_pdf_document_versions_on_pdf_document_id"
    t.index ["workspace_id"], name: "index_pdf_document_versions_on_workspace_id"
  end

  create_table "pdf_documents", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "current_version_id"
    t.boolean "encrypted", default: false, null: false
    t.integer "lock_version", default: 0, null: false
    t.string "original_filename", null: false
    t.integer "page_count"
    t.text "searchable_text"
    t.text "text_index_error"
    t.datetime "text_indexed_at"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["user_id", "updated_at"], name: "index_pdf_documents_on_user_id_and_updated_at"
    t.index ["user_id"], name: "index_pdf_documents_on_user_id"
    t.index ["workspace_id", "user_id"], name: "index_pdf_documents_on_workspace_id_and_user_id"
    t.index ["workspace_id"], name: "index_pdf_documents_on_workspace_id"
  end

  create_table "portfolio_features", force: :cascade do |t|
    t.string "alt_text"
    t.string "category", null: false
    t.datetime "created_at", null: false
    t.string "demo_path"
    t.bigint "portfolio_project_id", null: false
    t.integer "position", default: 0, null: false
    t.boolean "published", default: false, null: false
    t.text "review_notes"
    t.text "summary", null: false
    t.string "title", null: false
    t.integer "tour_position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["portfolio_project_id", "published", "position"], name: "idx_portfolio_features_order"
    t.index ["portfolio_project_id", "tour_position"], name: "idx_portfolio_features_tour_order"
    t.index ["portfolio_project_id"], name: "index_portfolio_features_on_portfolio_project_id"
  end

  create_table "portfolio_profiles", force: :cascade do |t|
    t.jsonb "architecture", default: [], null: false
    t.datetime "created_at", null: false
    t.jsonb "engineering_highlights", default: [], null: false
    t.string "full_name", null: false
    t.string "headline", null: false
    t.string "location"
    t.jsonb "metrics", default: [], null: false
    t.boolean "published", default: false, null: false
    t.jsonb "skills", default: [], null: false
    t.jsonb "social_links", default: {}, null: false
    t.text "summary", null: false
    t.datetime "updated_at", null: false
  end

  create_table "portfolio_projects", force: :cascade do |t|
    t.jsonb "case_study", default: {}, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.jsonb "engineering_highlights", default: [], null: false
    t.boolean "featured", default: false, null: false
    t.string "live_url"
    t.jsonb "metrics", default: [], null: false
    t.integer "position", default: 0, null: false
    t.boolean "published", default: false, null: false
    t.string "repository_url"
    t.jsonb "seo", default: {}, null: false
    t.string "slug", null: false
    t.jsonb "stack", default: [], null: false
    t.text "summary", null: false
    t.string "tagline"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["published", "position"], name: "index_portfolio_projects_on_published_and_position"
    t.index ["slug"], name: "index_portfolio_projects_on_slug", unique: true
  end

  create_table "post_likes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "post_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["post_id", "user_id"], name: "index_post_likes_on_post_id_and_user_id", unique: true
    t.index ["post_id"], name: "index_post_likes_on_post_id"
    t.index ["user_id", "post_id"], name: "index_post_likes_on_user_id_and_post_id", unique: true
    t.index ["user_id"], name: "index_post_likes_on_user_id"
    t.index ["workspace_id"], name: "index_post_likes_on_workspace_id"
  end

  create_table "posts", force: :cascade do |t|
    t.integer "comments_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.string "image"
    t.string "message"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["created_at"], name: "index_posts_on_created_at"
    t.index ["user_id"], name: "index_posts_on_user_id"
    t.index ["workspace_id"], name: "index_posts_on_workspace_id"
  end

  create_table "project_environments", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name", null: false
    t.bigint "project_id", null: false
    t.datetime "updated_at", null: false
    t.string "url"
    t.bigint "workspace_id", null: false
    t.index ["project_id", "name"], name: "index_project_environments_on_project_id_and_name", unique: true
    t.index ["project_id"], name: "index_project_environments_on_project_id"
    t.index ["workspace_id"], name: "index_project_environments_on_workspace_id"
  end

  create_table "project_users", force: :cascade do |t|
    t.integer "allocation_percentage", default: 0, null: false
    t.datetime "created_at", null: false
    t.bigint "project_id", null: false
    t.string "role", default: "collaborator", null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "workload_status", default: "partial", null: false
    t.bigint "workspace_id", null: false
    t.index ["project_id", "user_id"], name: "index_project_users_on_project_id_and_user_id", unique: true
    t.index ["project_id"], name: "index_project_users_on_project_id"
    t.index ["user_id"], name: "index_project_users_on_user_id"
    t.index ["workspace_id"], name: "index_project_users_on_workspace_id"
  end

  create_table "project_vault_items", force: :cascade do |t|
    t.string "category"
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.bigint "project_environment_id"
    t.bigint "project_id", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.string "username"
    t.bigint "workspace_id", null: false
    t.index ["project_environment_id"], name: "index_project_vault_items_on_project_environment_id"
    t.index ["project_id", "category"], name: "index_project_vault_items_on_project_id_and_category"
    t.index ["project_id"], name: "index_project_vault_items_on_project_id"
    t.index ["workspace_id"], name: "index_project_vault_items_on_workspace_id"
  end

  create_table "projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.date "end_date"
    t.string "issue_sheet_id"
    t.string "issue_sheet_name", default: "Issue Tracker", null: false
    t.string "name", null: false
    t.bigint "owner_id"
    t.boolean "qa_mode_enabled", default: false, null: false
    t.string "sheet_id"
    t.boolean "sheet_integration_enabled", default: false
    t.date "start_date"
    t.string "status", default: "running"
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["owner_id"], name: "index_projects_on_owner_id"
    t.index ["workspace_id", "name"], name: "index_projects_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_projects_on_workspace_id"
  end

  create_table "roles", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_roles_on_name", unique: true
  end

  create_table "skill_endorsements", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "endorser_id", null: false
    t.text "note"
    t.bigint "team_id"
    t.datetime "updated_at", null: false
    t.bigint "user_skill_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["endorser_id", "user_skill_id"], name: "index_skill_endorsements_on_endorser_and_user_skill", unique: true
    t.index ["endorser_id"], name: "index_skill_endorsements_on_endorser_id"
    t.index ["team_id"], name: "index_skill_endorsements_on_team_id"
    t.index ["user_skill_id"], name: "index_skill_endorsements_on_user_skill_id"
    t.index ["workspace_id"], name: "index_skill_endorsements_on_workspace_id"
  end

  create_table "skills", force: :cascade do |t|
    t.string "category"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_skills_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_skills_on_workspace_id"
  end

  create_table "sprints", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.date "end_date", null: false
    t.string "name", null: false
    t.integer "progress", default: 0
    t.bigint "project_id", null: false
    t.date "start_date", null: false
    t.string "status", default: "todo"
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.integer "working_days_mask", default: 62, null: false
    t.bigint "workspace_id", null: false
    t.index ["end_date"], name: "index_sprints_on_end_date"
    t.index ["project_id"], name: "index_sprints_on_project_id"
    t.index ["start_date"], name: "index_sprints_on_start_date"
    t.index ["working_days_mask"], name: "index_sprints_on_working_days_mask"
    t.index ["workspace_id"], name: "index_sprints_on_workspace_id"
  end

  create_table "task_logs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.bigint "developer_id", null: false
    t.decimal "hours_logged", precision: 5, scale: 2, null: false
    t.date "log_date", null: false
    t.string "status", default: "todo"
    t.bigint "task_id", null: false
    t.string "type", default: "code"
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "workspace_id", null: false
    t.index ["developer_id"], name: "index_task_logs_on_developer_id"
    t.index ["log_date"], name: "index_task_logs_on_log_date"
    t.index ["task_id"], name: "index_task_logs_on_task_id"
    t.index ["workspace_id"], name: "index_task_logs_on_workspace_id"
  end

  create_table "tasks", force: :cascade do |t|
    t.integer "assigned_to_user"
    t.decimal "automation_qa_hours", precision: 6, scale: 2
    t.boolean "blocker", default: false, null: false
    t.decimal "code_review_hours", precision: 6, scale: 2
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.boolean "demo", default: false, null: false
    t.text "description"
    t.decimal "dev_hours", precision: 6, scale: 2
    t.decimal "dev_to_qa_hours", precision: 6, scale: 2
    t.bigint "developer_id"
    t.date "end_date"
    t.decimal "estimated_hours", precision: 5, scale: 2
    t.string "internal_qa"
    t.integer "order", default: 0
    t.string "priority"
    t.bigint "project_id"
    t.string "qa_assigned"
    t.decimal "qa_hours", precision: 6, scale: 2
    t.bigint "sprint_id"
    t.date "start_date"
    t.string "status", default: "todo"
    t.decimal "story_point", precision: 6, scale: 2
    t.decimal "swag_point", precision: 6, scale: 2
    t.string "task_id"
    t.string "task_url"
    t.string "title"
    t.decimal "total_hours", precision: 6, scale: 2
    t.string "type", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
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
    t.datetime "created_at", null: false
    t.string "role", default: "member", null: false
    t.string "status", default: "pending", null: false
    t.bigint "team_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["team_id", "user_id"], name: "index_team_users_on_team_id_and_user_id", unique: true
    t.index ["team_id"], name: "index_team_users_on_team_id"
    t.index ["user_id"], name: "index_team_users_on_user_id"
    t.index ["workspace_id"], name: "index_team_users_on_workspace_id"
  end

  create_table "teams", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name", null: false
    t.bigint "owner_id"
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["owner_id"], name: "index_teams_on_owner_id"
    t.index ["workspace_id", "name"], name: "index_teams_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_teams_on_workspace_id"
  end

  create_table "topic_follows", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "topic_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["topic_id"], name: "index_topic_follows_on_topic_id"
    t.index ["user_id", "topic_id"], name: "index_topic_follows_on_user_id_and_topic_id", unique: true
    t.index ["user_id"], name: "index_topic_follows_on_user_id"
    t.index ["workspace_id"], name: "index_topic_follows_on_workspace_id"
  end

  create_table "topics", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name", null: false
    t.integer "topic_follows_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_topics_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_topics_on_workspace_id"
  end

  create_table "user_roles", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "role_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["role_id"], name: "index_user_roles_on_role_id"
    t.index ["user_id", "role_id"], name: "index_user_roles_on_user_id_and_role_id", unique: true
    t.index ["user_id"], name: "index_user_roles_on_user_id"
    t.index ["workspace_id"], name: "index_user_roles_on_workspace_id"
  end

  create_table "user_skills", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "endorsements_count", default: 0, null: false
    t.datetime "last_endorsed_at"
    t.string "proficiency", default: "beginner", null: false
    t.bigint "skill_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["skill_id"], name: "index_user_skills_on_skill_id"
    t.index ["user_id", "skill_id"], name: "index_user_skills_on_user_id_and_skill_id", unique: true
    t.index ["user_id"], name: "index_user_skills_on_user_id"
    t.index ["workspace_id"], name: "index_user_skills_on_workspace_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "availability_status", default: "available_now", null: false
    t.string "avatar_color"
    t.text "bio"
    t.string "color_theme", default: "blue"
    t.datetime "confirmation_sent_at"
    t.string "confirmation_token"
    t.datetime "confirmed_at"
    t.datetime "created_at", null: false
    t.integer "current_projects_count", default: 0, null: false
    t.boolean "dark_mode", default: false, null: false
    t.date "date_of_birth"
    t.boolean "demo_account", default: false, null: false
    t.bigint "department_id"
    t.string "email", default: "", null: false
    t.string "encrypted_keka_api_key"
    t.string "encrypted_keka_api_key_iv"
    t.string "encrypted_password", default: "", null: false
    t.string "first_name"
    t.string "job_title", default: "Team Member", null: false
    t.string "jti"
    t.string "keka_base_url"
    t.string "keka_employee_id"
    t.datetime "keka_last_synced_at"
    t.jsonb "keka_profile_data", default: {}, null: false
    t.string "landing_page", default: "posts"
    t.string "last_name"
    t.datetime "last_seen_at"
    t.jsonb "notification_preferences", default: {"digest"=>false, "update"=>true, "assigned"=>true, "commented"=>true}, null: false
    t.string "phone_number"
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.boolean "site_admin", default: false, null: false
    t.jsonb "social_links", default: {}, null: false
    t.string "status", default: "new", null: false
    t.string "unconfirmed_email"
    t.datetime "updated_at", null: false
    t.bigint "workspace_id", null: false
    t.index ["availability_status"], name: "index_users_on_availability_status"
    t.index ["confirmation_token"], name: "index_users_on_confirmation_token", unique: true
    t.index ["department_id"], name: "index_users_on_department_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["last_seen_at"], name: "index_users_on_last_seen_at"
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
    t.index ["workspace_id", "created_at"], name: "index_users_on_workspace_id_and_created_at"
    t.index ["workspace_id"], name: "index_users_on_workspace_id"
  end

  create_table "work_categories", force: :cascade do |t|
    t.string "color"
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.string "hex"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_categories_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_categories_on_workspace_id"
  end

  create_table "work_log_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "work_log_id", null: false
    t.bigint "work_tag_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["work_log_id", "work_tag_id"], name: "index_work_log_tags_on_work_log_id_and_work_tag_id", unique: true
    t.index ["work_log_id"], name: "index_work_log_tags_on_work_log_id"
    t.index ["work_tag_id"], name: "index_work_log_tags_on_work_tag_id"
    t.index ["workspace_id"], name: "index_work_log_tags_on_workspace_id"
  end

  create_table "work_logs", force: :cascade do |t|
    t.integer "actual_minutes", default: 0
    t.bigint "category_id"
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.text "description"
    t.time "end_time", null: false
    t.date "log_date", null: false
    t.bigint "priority_id"
    t.time "start_time", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["category_id"], name: "index_work_logs_on_category_id"
    t.index ["priority_id"], name: "index_work_logs_on_priority_id"
    t.index ["user_id", "log_date"], name: "index_work_logs_on_user_id_and_log_date"
    t.index ["user_id"], name: "index_work_logs_on_user_id"
    t.index ["workspace_id"], name: "index_work_logs_on_workspace_id"
  end

  create_table "work_notes", force: :cascade do |t|
    t.text "content"
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.date "note_date", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "user_id", null: false
    t.bigint "workspace_id", null: false
    t.index ["user_id", "note_date"], name: "index_work_notes_on_user_id_and_note_date", unique: true
    t.index ["user_id"], name: "index_work_notes_on_user_id"
    t.index ["workspace_id"], name: "index_work_notes_on_workspace_id"
  end

  create_table "work_priorities", force: :cascade do |t|
    t.string "color"
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.string "hex"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_priorities_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_priorities_on_workspace_id"
  end

  create_table "work_tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "created_by"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.integer "updated_by"
    t.bigint "workspace_id", null: false
    t.index ["workspace_id", "name"], name: "index_work_tags_on_workspace_id_and_name", unique: true
    t.index ["workspace_id"], name: "index_work_tags_on_workspace_id"
  end

  create_table "workspaces", force: :cascade do |t|
    t.string "billing_status", default: "trialing", null: false
    t.datetime "created_at", null: false
    t.string "kind", default: "private", null: false
    t.jsonb "module_overrides", default: {}, null: false
    t.string "name", null: false
    t.string "plan_key", default: "starter", null: false
    t.integer "seat_limit_override"
    t.string "slug", null: false
    t.datetime "trial_ends_at"
    t.datetime "updated_at", null: false
    t.index ["billing_status"], name: "index_workspaces_on_billing_status"
    t.index ["plan_key"], name: "index_workspaces_on_plan_key"
    t.index ["slug"], name: "index_workspaces_on_slug", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "calendar_events", "projects"
  add_foreign_key "calendar_events", "sprints"
  add_foreign_key "calendar_events", "tasks"
  add_foreign_key "calendar_events", "users"
  add_foreign_key "calendar_events", "workspaces"
  add_foreign_key "comments", "posts"
  add_foreign_key "comments", "users"
  add_foreign_key "comments", "workspaces"
  add_foreign_key "conversation_participants", "conversations"
  add_foreign_key "conversation_participants", "users"
  add_foreign_key "conversation_participants", "workspaces"
  add_foreign_key "conversations", "users", column: "creator_id"
  add_foreign_key "conversations", "workspaces"
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
  add_foreign_key "message_reactions", "messages"
  add_foreign_key "message_reactions", "users"
  add_foreign_key "message_reactions", "workspaces"
  add_foreign_key "messages", "conversations"
  add_foreign_key "messages", "users"
  add_foreign_key "messages", "workspaces"
  add_foreign_key "notifications", "users", column: "actor_id"
  add_foreign_key "notifications", "users", column: "recipient_id"
  add_foreign_key "notifications", "workspaces"
  add_foreign_key "pdf_document_artifacts", "pdf_document_operations"
  add_foreign_key "pdf_document_artifacts", "pdf_documents"
  add_foreign_key "pdf_document_artifacts", "users"
  add_foreign_key "pdf_document_artifacts", "workspaces"
  add_foreign_key "pdf_document_operations", "pdf_document_versions", column: "base_version_id", on_delete: :nullify
  add_foreign_key "pdf_document_operations", "pdf_documents"
  add_foreign_key "pdf_document_operations", "users"
  add_foreign_key "pdf_document_operations", "workspaces"
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
  add_foreign_key "project_environments", "projects"
  add_foreign_key "project_environments", "workspaces"
  add_foreign_key "project_users", "projects"
  add_foreign_key "project_users", "users"
  add_foreign_key "project_users", "workspaces"
  add_foreign_key "project_vault_items", "project_environments"
  add_foreign_key "project_vault_items", "projects"
  add_foreign_key "project_vault_items", "workspaces"
  add_foreign_key "projects", "users", column: "owner_id"
  add_foreign_key "projects", "workspaces"
  add_foreign_key "skill_endorsements", "teams"
  add_foreign_key "skill_endorsements", "user_skills"
  add_foreign_key "skill_endorsements", "users", column: "endorser_id"
  add_foreign_key "skill_endorsements", "workspaces"
  add_foreign_key "skills", "workspaces"
  add_foreign_key "sprints", "projects"
  add_foreign_key "sprints", "workspaces"
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
  add_foreign_key "user_roles", "workspaces"
  add_foreign_key "user_skills", "skills"
  add_foreign_key "user_skills", "users"
  add_foreign_key "user_skills", "workspaces"
  add_foreign_key "users", "departments"
  add_foreign_key "users", "workspaces"
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
end
