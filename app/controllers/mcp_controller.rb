class McpController < ApplicationController
  include AuthenticatedResourceLimits
  skip_forgery_protection
  skip_before_action :set_current_user
  before_action :authenticate_mcp_token!, only: :handle
  after_action :reset_current_user

  def show
    render json: {
      name: "rails-vite-workspace-mcp",
      status: "ok",
      endpoint: "/mcp",
      transport: "streamable_http",
      tools_count: Mcp::ToolRegistry.tools.length,
      docs: "/docs/chatgpt_mcp_setup.md"
    }
  end

  def preflight
    head :no_content
  end

  def handle
    payload = parse_payload
    messages = payload.is_a?(Array) ? payload : [payload]
    return render json: jsonrpc_error(nil, -32_600, "Batch limited to 20 messages"), status: :unprocessable_entity if messages.size > 20
    AbusePrevention::RateLimiter.check!(Current.user, :mcp, cost: [messages.size, 1].max)
    responses = messages.filter_map { |message| handle_message(message) }

    if payload.is_a?(Array)
      return head :accepted if responses.empty?

      render json: responses
    elsif responses.empty?
      head :accepted
    else
      render json: responses.first
    end
  rescue JSON::ParserError
    render json: jsonrpc_error(nil, -32_700, "Parse error"), status: :bad_request
  end

  private

  attr_reader :mcp_access_token

  def authenticate_mcp_token!
    @mcp_access_token = McpAccessToken.authenticate(raw_mcp_token)
    return set_mcp_current_context if @mcp_access_token

    response.set_header("WWW-Authenticate", 'Bearer realm="rails-vite-mcp"')
    render json: { error: "invalid_mcp_token" }, status: :unauthorized
  end

  def raw_mcp_token
    bearer_token.presence || query_token
  end

  def bearer_token
    request.authorization.to_s[/\ABearer\s+(.+)\z/i, 1]
  end

  def query_token
    return unless query_token_allowed?

    params[:mcp_token].presence || params[:access_token].presence
  end

  def query_token_allowed?
    ActiveModel::Type::Boolean.new.cast(
      ENV.fetch("MCP_ALLOW_QUERY_TOKEN", Rails.env.development? || Rails.env.test?)
    )
  end

  def set_mcp_current_context
    Current.user = @mcp_access_token.user
    Current.workspace = @mcp_access_token.workspace
    Current.membership = Current.user.membership_for(Current.workspace)
  end

  def parse_payload
    JSON.parse(request.raw_post)
  end

  def handle_message(message)
    return jsonrpc_error(nil, -32_600, "Invalid Request") unless message.is_a?(Hash)

    id = message["id"]
    method = message["method"].to_s
    params = message["params"] || {}
    notification = !message.key?("id")

    response =
      case method
      when "initialize"
        initialize_response(id)
      when "ping"
        jsonrpc_result(id, {})
      when "tools/list"
        jsonrpc_result(id, { tools: Mcp::ToolRegistry.tools })
      when "tools/call"
        jsonrpc_result(id, call_tool(params))
      when "resources/list"
        jsonrpc_result(id, { resources: Mcp::ToolRegistry.resources })
      when "resources/read"
        read_resource_response(id, params)
      when /\Anotifications\//
        nil
      else
        jsonrpc_error(id, -32_601, "Method not found: #{method}")
      end

    notification ? nil : response
  rescue Mcp::ToolExecutor::ToolError => e
    return nil if notification

    jsonrpc_result(id, tool_error_payload(e.message))
  rescue StandardError => e
    Rails.logger.error("MCP request failed: #{e.class}: #{e.message}")
    return nil if notification

    jsonrpc_error(id, -32_603, "Internal error")
  end

  def initialize_response(id)
    response.set_header("Mcp-Session-Id", SecureRandom.uuid)
    jsonrpc_result(
      id,
      {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {
            listChanged: false
          },
          resources: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "rails-vite-workspace-mcp",
          version: "0.1.0"
        },
        instructions: Mcp::ToolRegistry.instructions
      }
    )
  end

  def call_tool(params)
    name = params["name"].to_s
    arguments = params["arguments"] || {}
    result = Mcp::ToolExecutor.new(
      user: mcp_access_token.user,
      token: mcp_access_token
    ).call(name, arguments)
    mcp_meta = result.is_a?(Hash) ? result.delete(:_meta) || result.delete("_meta") : nil

    payload = {
      content: [
        {
          type: "text",
          text: JSON.pretty_generate(result)
        }
      ],
      structuredContent: result,
      isError: false
    }
    payload[:_meta] = mcp_meta if mcp_meta.present?
    payload
  end

  def read_resource_response(id, params)
    uri = params["uri"].to_s
    resource = Mcp::ToolRegistry.read_resource(uri)
    return jsonrpc_error(id, -32_602, "Resource not found: #{uri}") unless resource

    jsonrpc_result(id, resource)
  end

  def tool_error_payload(message)
    {
      content: [
        {
          type: "text",
          text: message
        }
      ],
      structuredContent: {
        error: message
      },
      isError: true
    }
  end

  def jsonrpc_result(id, result)
    {
      jsonrpc: "2.0",
      id: id,
      result: result
    }
  end

  def jsonrpc_error(id, code, message)
    {
      jsonrpc: "2.0",
      id: id,
      error: {
        code: code,
        message: message
      }
    }
  end
end
