require "test_helper"

class McpControllerTest < ActionDispatch::IntegrationTest
  setup do
    @workspace = Workspace.create!(name: "MCP Workspace", slug: "mcp-workspace", kind: "private")
    @foreign_workspace = Workspace.create!(name: "Foreign MCP Workspace", slug: "foreign-mcp-workspace", kind: "private")
    @user = create_test_user(workspace: @workspace, email: "mcp-owner@example.test")
    @foreign_user = create_test_user(workspace: @foreign_workspace, email: "mcp-foreign@example.test")

    # MCP uses a nonprivileged integration identity with project ownership.
    Current.set(workspace: @workspace) { @user.roles = [Role.find_by!(name: "member")] }

    Current.user = @user
    Current.workspace = @workspace
    @project = Project.create!(name: "MCP Project", description: "Visible through MCP", owner: @user)
    Task.create!(
      project: @project,
      type: "general",
      title: "MCP visible task",
      status: "todo",
      assigned_user: @user,
      created_by: @user.id
    )

    Current.user = @foreign_user
    Current.workspace = @foreign_workspace
    foreign_project = Project.create!(name: "Foreign MCP Project", owner: @foreign_user)
    Task.create!(
      project: foreign_project,
      type: "general",
      title: "Foreign hidden task",
      status: "todo",
      assigned_user: @foreign_user,
      created_by: @foreign_user.id
    )

    Current.reset_all
    @token_record, @raw_token = McpAccessToken.issue!(user: @user, name: "test-chatgpt")
  end

  test "requires an mcp access token" do
    post "/mcp", params: rpc_payload("initialize").to_json, headers: json_headers

    assert_response :unauthorized
    assert_equal "invalid_mcp_token", JSON.parse(response.body).fetch("error")
  end

  test "initializes and lists tools" do
    post_rpc("initialize")

    assert_response :success
    initialize_payload = JSON.parse(response.body)
    assert_equal "2025-06-18", initialize_payload.dig("result", "protocolVersion")
    assert_equal "rails-vite-workspace-mcp", initialize_payload.dig("result", "serverInfo", "name")

    post_rpc("tools/list")

    assert_response :success
    tool_names = JSON.parse(response.body).dig("result", "tools").map { |tool| tool.fetch("name") }
    assert_includes tool_names, "app_snapshot"
    assert_includes tool_names, "list_projects"
    assert_includes tool_names, "repo_read_file"
    assert_includes tool_names, "repo_write_file"
    assert_includes tool_names, "repo_diff"
    assert_includes tool_names, "repo_commit"
    assert_includes tool_names, "run_tests"
    assert_includes tool_names, "db_query"
    assert_includes tool_names, "rails_runner"
    assert_includes tool_names, "rails_console"
    assert_includes tool_names, "mcp_capability_matrix"
    assert_includes tool_names, "workspace_autopilot_plan"
    assert_includes tool_names, "repo_patch_preview"
    assert_includes tool_names, "create_knowledge_items"
    assert_includes tool_names, "list_knowledge_items"
    assert_includes tool_names, "export_sprint_tasks"
  end

  test "tool descriptors include apps sdk metadata and output schema" do
    post_rpc("tools/list")

    assert_response :success
    tools = JSON.parse(response.body).dig("result", "tools")
    autopilot_tool = tools.find { |tool| tool.fetch("name") == "render_workspace_autopilot" }
    repo_patch_preview = tools.find { |tool| tool.fetch("name") == "repo_patch_preview" }

    assert_equal "object", autopilot_tool.dig("outputSchema", "type")
    assert_equal [{ "type" => "noauth" }], autopilot_tool.fetch("securitySchemes")
    assert_equal "ui://widget/workspace_autopilot.html", autopilot_tool.dig("_meta", "openai/outputTemplate")
    assert_equal autopilot_tool.fetch("securitySchemes"), autopilot_tool.dig("_meta", "securitySchemes")
    assert_equal true, repo_patch_preview.dig("annotations", "readOnlyHint")
    assert_equal false, repo_patch_preview.dig("annotations", "destructiveHint")
  end

  test "resources read returns the workspace autopilot widget" do
    post_rpc("resources/read", { uri: "ui://widget/workspace_autopilot.html" })

    assert_response :success
    content = JSON.parse(response.body).dig("result", "contents").first
    assert_equal "ui://widget/workspace_autopilot.html", content.fetch("uri")
    assert_equal "text/html;profile=mcp-app", content.fetch("mimeType")
    assert_includes content.fetch("text"), "Workspace Autopilot"
  end

  test "tool calls are scoped to the token workspace" do
    post_rpc("tools/call", { name: "search_everything", arguments: { q: "MCP" } })

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    titles = result.fetch("results").map { |item| item.fetch("title") }
    assert_includes titles, "MCP Project"
    assert_includes titles, "MCP visible task"
    assert_not titles.any? { |title| title.include?("Foreign") }
  end

  test "capability matrix marks unsafe raw APIs as excluded" do
    post_rpc("tools/call", { name: "mcp_capability_matrix", arguments: { include_routes: false } })

    assert_response :success
    rows = JSON.parse(response.body).dig("result", "structuredContent", "capabilities")
    auth_row = rows.find { |row| row.fetch("controller") == "api/auth" }
    projects_row = rows.find { |row| row.fetch("controller") == "api/projects" }

    assert_equal "excluded", auth_row.fetch("status")
    assert_match(/blocked/, auth_row.fetch("reason"))
    assert_equal "curated", projects_row.fetch("status")
    assert_includes projects_row.fetch("tools"), "list_projects"
  end

  test "write-scoped token can create a task" do
    assert_difference -> { Task.unscoped.where(workspace: @workspace).count }, 1 do
      post_rpc(
        "tools/call",
        {
          name: "create_task",
          arguments: {
            title: "Task from ChatGPT MCP",
            status: "todo",
            assigned_to_user: @user.id
          }
        }
      )
    end

    assert_response :success
    payload = JSON.parse(response.body).dig("result")
    assert_equal false, payload.fetch("isError")
    assert_equal "Task from ChatGPT MCP", payload.dig("structuredContent", "task", "title")
  end

  test "read-only token cannot write" do
    _record, raw_read_token = McpAccessToken.issue!(user: @user, name: "read-only", scopes: ["app:read"])

    post "/mcp",
      params: rpc_payload("tools/call", { name: "create_task", arguments: { title: "Blocked write" } }).to_json,
      headers: json_headers.merge("Authorization" => "Bearer #{raw_read_token}")

    assert_response :success
    payload = JSON.parse(response.body).dig("result")
    assert_equal true, payload.fetch("isError")
    assert_match(/does not allow app writes/, payload.dig("structuredContent", "error"))
  end

  test "write-scoped token can export sprint tasks to the configured sheet" do
    @project.update!(sheet_id: "sheet-test-123")
    sprint = @project.sprints.create!(
      name: "J1",
      start_date: Date.new(2026, 6, 1),
      end_date: Date.new(2026, 6, 5)
    )
    task = @project.tasks.create!(
      task_id: "MYFR-2917",
      type: "Code",
      title: "Export through MCP",
      sprint: sprint,
      developer: @user,
      created_by: @user.id
    )

    initializers = []
    credential_workspaces = []
    exports = []
    fake_service = Object.new
    fake_service.define_singleton_method(:export_tasks) do |tasks, title: nil|
      exports << { tasks: tasks.to_a, title: title }
    end

    factory = lambda do |sheet_name, spreadsheet_id, workspace:|
      initializers << { sheet_name: sheet_name, spreadsheet_id: spreadsheet_id }
      credential_workspaces << workspace.id
      fake_service
    end

    original_new = TaskSheetService.method(:new)
    TaskSheetService.define_singleton_method(:new, factory)

    begin
      assert_difference -> { McpAuditLog.unscoped.where(tool_name: "export_sprint_tasks").count }, 1 do
        post_rpc("tools/call", { name: "export_sprint_tasks", arguments: { sprint_id: sprint.id } })
      end
    ensure
      TaskSheetService.define_singleton_method(:new, original_new)
    end

    assert_response :success
    result = JSON.parse(response.body).dig("result")
    assert_equal false, result.fetch("isError")
    payload = result.fetch("structuredContent")
    assert_equal true, payload.fetch("exported")
    assert_equal "J1", payload.fetch("sheet_name")
    assert_equal 1, payload.fetch("task_count")
    assert_equal [{ sheet_name: "J1", spreadsheet_id: "sheet-test-123" }], initializers
    assert_equal [@workspace.id], credential_workspaces
    assert_equal [task.id], exports.first.fetch(:tasks).map(&:id)
    assert_match(/J1 : 06\/01\/2026 - 06\/05\/2026/, exports.first.fetch(:title))
  end

  test "read-only token cannot create generated knowledge items" do
    _record, raw_read_token = McpAccessToken.issue!(user: @user, name: "read-only-knowledge", scopes: ["app:read"])

    post "/mcp",
      params: rpc_payload("tools/call", {
        name: "create_knowledge_items",
        arguments: {
          prompt: "Create facts",
          items: [{ title: "Blocked fact" }]
        }
      }).to_json,
      headers: json_headers.merge("Authorization" => "Bearer #{raw_read_token}")

    assert_response :success
    payload = JSON.parse(response.body).dig("result")
    assert_equal true, payload.fetch("isError")
    assert_match(/does not allow app writes/, payload.dig("structuredContent", "error"))
  end

  test "mcp creates prompt run and generated knowledge cards in history mode" do
    assert_difference -> { KnowledgePromptRun.unscoped.where(workspace: @workspace).count }, 1 do
      assert_difference -> { KnowledgeItem.unscoped.where(workspace: @workspace).count }, 2 do
        assert_difference -> { McpAuditLog.unscoped.where(tool_name: "create_knowledge_items").count }, 1 do
          post_rpc(
            "tools/call",
            {
              name: "create_knowledge_items",
              arguments: {
                prompt: "Give me two useful MCP facts",
                collection_name: "MCP Inbox",
                items: [
                  {
                    title: "MCP cards support citations",
                    summary: "Cards can store source names and URLs.",
                    category: "tech",
                    source_name: "Example Source",
                    source_url: "https://example.test/mcp",
                    tags: ["mcp", "citations"]
                  },
                  {
                    title: "MCP cards keep history",
                    summary: "Each prompt creates a prompt run.",
                    category: "learning"
                  }
                ]
              }
            }
          )
        end
      end
    end

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    assert_equal "history", result.dig("knowledge_prompt_run", "generation_mode")
    assert_equal 2, result.fetch("knowledge_items").length
    assert_equal "MCP cards support citations", result.fetch("knowledge_items").first.fetch("title")
  end

  test "mcp lists generated knowledge items" do
    Current.user = @user
    Current.workspace = @workspace
    run = @user.knowledge_prompt_runs.create!(prompt: "Listable facts")
    @user.knowledge_items.create!(
      knowledge_prompt_run: run,
      title: "Listable MCP fact",
      category: "tech"
    )
    Current.reset_all

    post_rpc("tools/call", { name: "list_knowledge_items", arguments: { active: true } })

    assert_response :success
    items = JSON.parse(response.body).dig("result", "structuredContent", "records")
    assert_includes items.map { |item| item.fetch("title") }, "Listable MCP fact"
  end

  test "replace topic archives matching source key and links replacement" do
    Current.user = @user
    Current.workspace = @workspace
    run = @user.knowledge_prompt_runs.create!(prompt: "Old topic")
    old_item = @user.knowledge_items.create!(
      knowledge_prompt_run: run,
      title: "Old Rails fact",
      source_key: "rails:fact"
    )
    Current.reset_all

    post_rpc(
      "tools/call",
      {
        name: "create_knowledge_items",
        arguments: {
          prompt: "Replace Rails fact",
          mode: "replace_topic",
          items: [
            {
              title: "New Rails fact",
              source_key: "rails:fact",
              category: "tech"
            }
          ]
        }
      }
    )

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    replacement_id = result.fetch("knowledge_items").first.fetch("id")
    assert_equal 1, result.fetch("archived_count")
    old_item.reload
    assert_not old_item.active?
    assert_equal replacement_id, old_item.replaced_by_id
  end

  test "replace all archives active mcp generated cards for current user" do
    Current.user = @user
    Current.workspace = @workspace
    run = @user.knowledge_prompt_runs.create!(prompt: "Old MCP batch", source: "mcp")
    old_item = @user.knowledge_items.create!(
      knowledge_prompt_run: run,
      title: "Old active MCP item",
      source_key: "old:mcp"
    )
    Current.reset_all

    post_rpc(
      "tools/call",
      {
        name: "create_knowledge_items",
        arguments: {
          prompt: "Replace all MCP facts",
          mode: "replace_all",
          source: "mcp",
          items: [{ title: "Fresh MCP item", source_key: "fresh:mcp" }]
        }
      }
    )

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    assert_equal 1, result.fetch("archived_count")
    assert_not old_item.reload.active?
    assert_equal "Fresh MCP item", result.fetch("knowledge_items").first.fetch("title")
  end

  test "create knowledge bookmark upserts duplicate identity" do
    arguments = {
      card_type: "mcp_knowledge_item",
      source_id: "knowledge_item:42",
      payload: {
        title: "Saved MCP card",
        summary: "Original summary"
      }
    }

    assert_difference -> { KnowledgeBookmark.unscoped.where(workspace: @workspace).count }, 1 do
      post_rpc("tools/call", { name: "create_knowledge_bookmark", arguments: arguments })
    end

    post_rpc(
      "tools/call",
      {
        name: "create_knowledge_bookmark",
        arguments: arguments.merge(payload: { title: "Saved MCP card", summary: "Updated summary" })
      }
    )

    assert_response :success
    bookmarks = KnowledgeBookmark.unscoped.where(workspace: @workspace, card_type: "mcp_knowledge_item", source_id: "knowledge_item:42")
    assert_equal 1, bookmarks.count
    assert_equal "Updated summary", bookmarks.first.payload.fetch("summary")
  end

  test "query token can be disabled outside developer mode" do
    with_env("MCP_ALLOW_QUERY_TOKEN" => "false") do
      post "/mcp?mcp_token=#{@raw_token}",
        params: rpc_payload("tools/call", { name: "app_snapshot", arguments: {} }).to_json,
        headers: json_headers
    end

    assert_response :unauthorized
  end

  test "query token works in test environment for ChatGPT developer connector URLs" do
    post "/mcp?mcp_token=#{@raw_token}",
      params: rpc_payload("tools/call", { name: "app_snapshot", arguments: {} }).to_json,
      headers: json_headers

    assert_response :success
    workspace = JSON.parse(response.body).dig("result", "structuredContent", "workspace")
    assert_equal @workspace.id, workspace.fetch("id")
  end

  test "raw database and repository mutation credentials cannot bypass privileged MFA" do
    %w[db:read repo:write system:admin].each do |scope|
      _, raw = McpAccessToken.issue!(user: @user, name: "restricted-#{scope}", scopes: ["app:read", scope])
      with_env("MCP_ENABLE_DB_TOOLS" => "true", "MCP_ENABLE_CODE_TOOLS" => "true", "MCP_ENABLE_RAILS_RUNTIME_TOOLS" => "true") do
        post "/mcp", params: rpc_payload("initialize").to_json, headers: json_headers.merge("Authorization" => "Bearer #{raw}")
      end
      assert_response :unauthorized
    end
  end

  test "rails runtime tools require system admin scope and env flag" do
    post_rpc(
      "tools/call",
      {
        name: "rails_runner",
        arguments: {
          code: "puts User.count",
          confirmation: "RUN_RAILS_CODE"
        }
      }
    )

    assert_response :success
    payload = JSON.parse(response.body).dig("result")
    assert_equal true, payload.fetch("isError")
    assert_match(/does not allow Rails runtime execution/, payload.dig("structuredContent", "error"))
  end

  test "repo patch preview validates without applying" do
    patch = <<~PATCH
      diff --git a/mcp_preview.txt b/mcp_preview.txt
      new file mode 100644
      index 0000000..c82a8d9
      --- /dev/null
      +++ b/mcp_preview.txt
      @@ -0,0 +1 @@
      +preview
    PATCH

    post_rpc("tools/call", { name: "repo_patch_preview", arguments: { patch: patch } })

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    assert_equal true, result.fetch("valid")
    assert_includes result.fetch("changed_paths"), "mcp_preview.txt"
    assert_not File.exist?(Rails.root.join("mcp_preview.txt"))
  end

  test "workspace privileged accounts cannot use a password-only MCP credential" do
    Current.set(workspace: @workspace) { @user.roles = [Role.find_by!(name: "owner")] }
    post_rpc("initialize")
    assert_response :unauthorized
  end

  test "workspace autopilot apply writes an audit log for approved actions" do
    task = Task.create!(
      type: "general",
      title: "Overdue autopilot task",
      status: "todo",
      assigned_user: @user,
      created_by: @user.id,
      end_date: 2.days.ago.to_date
    )

    assert_difference -> { McpAuditLog.unscoped.where(tool_name: "workspace_autopilot_apply").count }, 1 do
      post_rpc(
        "tools/call",
        {
          name: "workspace_autopilot_apply",
          arguments: {
            action_ids: ["focus_task_#{task.id}"]
          }
        }
      )
    end

    assert_response :success
    result = JSON.parse(response.body).dig("result", "structuredContent")
    assert_equal 1, result.fetch("applied_count")
    assert_equal "created_or_found_focus_block", result.fetch("applied").first.fetch("result")
  end

  private

  def post_rpc(method, params = {})
    post "/mcp",
      params: rpc_payload(method, params).to_json,
      headers: json_headers.merge("Authorization" => "Bearer #{@raw_token}")
  end

  def rpc_payload(method, params = {})
    {
      jsonrpc: "2.0",
      id: "test-#{SecureRandom.hex(4)}",
      method: method,
      params: params
    }
  end

  def json_headers
    {
      "CONTENT_TYPE" => "application/json",
      "ACCEPT" => "application/json"
    }
  end

  def with_env(values)
    previous = values.keys.index_with { |key| ENV[key] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each do |key, value|
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
  end
end
