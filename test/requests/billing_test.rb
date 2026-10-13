require "test_helper"
require "minitest/mock"

class BillingTest < ActionDispatch::IntegrationTest
  class FakeProvider < Billing::Provider
    attr_accessor :remote, :checkout_calls, :fetch_calls, :fail_fetch
    def initialize(name)
      super
      @checkout_calls = @fetch_calls = 0
    end
    def checkout(subscription, user)
      @checkout_calls += 1
      subscription.update!(customer_id: "cus_company") if @name == "stripe"
      { checkout_id: "checkout_company", checkout_url: @name == "stripe" ? "https://checkout.stripe.com/test" : "https://rzp.io/test", checkout_expires_at: 1.hour.from_now }.merge(@name == "razorpay" ? { external_id: "sub_company" } : {})
    end
    def fetch_subscription(id)
      @fetch_calls += 1
      raise Billing::Error, "Unavailable" if fail_fetch
      remote
    end
    def cancel(subscription)
      remote.merge("cancel_at_period_end" => true)
    end
    def portal(subscription)
      "https://billing.stripe.com/test"
    end
  end

  setup do
    @previous_env = ENV.to_h
    ENV.update("BILLING_MODE" => "test", "BILLING_RETURN_URL" => "https://workspace.example/settings", "STRIPE_SECRET_KEY" => "sk_test_fake", "STRIPE_WEBHOOK_SECRET" => "whsec_fake", "STRIPE_GROWTH_PRICE_ID" => "price_growth", "STRIPE_ENTERPRISE_PRICE_ID" => "price_enterprise", "RAZORPAY_KEY_ID" => "rzp_test_fake", "RAZORPAY_KEY_SECRET" => "secret_fake", "RAZORPAY_WEBHOOK_SECRET" => "rzp_secret", "RAZORPAY_GROWTH_PLAN_ID" => "plan_growth", "RAZORPAY_SUBSCRIPTION_CYCLES" => "12")
    @workspace = Workspace.create!(name: "Billing Company", slug: "billing-company", kind: "private")
    @owner = create_test_user(workspace: @workspace, email: "billing-owner@example.test")
    Current.set(user: @owner, workspace: @workspace) { @owner.roles = [Role.find_by!(name: "owner")] }
    @session, = MobileSession.issue_for!(user: @owner)
    @headers = { "Authorization" => "Bearer #{MobileAccessToken.issue(@session)[:token]}" }
  end

  teardown { ENV.replace(@previous_env) }

  test "owner checkout reuses a pending link without granting paid access" do
    provider = FakeProvider.new("stripe")
    Billing::Provider.stub(:new, provider) do
      2.times do
        post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth", workspace_id: 123 }, headers: @headers
        assert_response :success
        assert_equal "https://checkout.stripe.com/test", response.parsed_body.dig("data", "url")
      end
    end
    assert_equal 1, provider.checkout_calls
    assert_equal "starter", @workspace.reload.saas_plan.dig(:plan, :key)
    assert_equal @workspace.id, BillingSubscription.last.workspace_id
  end

  test "both providers are offered only when configured for the selected environment" do
    get "/api/v1/billing", headers: @headers
    assert_response :success
    assert_equal %w[stripe razorpay], response.parsed_body.dig("data", "providers").map { |provider| provider.fetch("key") }
    ENV["STRIPE_SECRET_KEY"] = "sk_live_wrong_environment"
    post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth" }, headers: @headers
    assert_response :service_unavailable
    assert_equal 0, BillingSubscription.count
  end

  test "members cannot manage billing and no request can supply another workspace" do
    member = create_test_user(workspace: @workspace, email: "billing-member@example.test")
    session, = MobileSession.issue_for!(user: member)
    post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth" }, headers: { "Authorization" => "Bearer #{MobileAccessToken.issue(session)[:token]}" }
    assert_response :forbidden
    assert_equal 0, BillingSubscription.count
  end

  test "signed stripe subscription events sync authoritative state and deduplicate" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote
    Billing::Provider.stub(:new, provider) do
      2.times { stripe_event("evt_active", "customer.subscription.updated", { "id" => subscription.external_id }) }
    end
    assert_equal 1, provider.fetch_calls
    assert_equal "growth", @workspace.reload.plan_key
    assert_equal "growth", @workspace.saas_plan.dig(:plan, :key)
  end

  test "old webhook payloads do not regress the current provider status" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote.merge("status" => "canceled")
    Billing::Provider.stub(:new, provider) { stripe_event("evt_old_active", "customer.subscription.updated", { "id" => subscription.external_id, "status" => "active" }) }
    assert_equal "canceled", subscription.reload.status
    assert_equal "starter", @workspace.reload.plan_key
  end

  test "bad signatures do not mutate billing" do
    create_subscription("stripe")
    post "/billing/webhooks/stripe", params: "{}", headers: { "Content-Type" => "application/json", "Stripe-Signature" => "invalid" }
    assert_response :bad_request
    assert_equal 0, BillingWebhookEvent.count
    assert_equal "starter", @workspace.reload.plan_key
  end

  test "failed provider fetch leaves webhook retryable" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote
    provider.fail_fetch = true
    Billing::Provider.stub(:new, provider) { stripe_event("evt_retry", "customer.subscription.updated", { "id" => subscription.external_id }, status: :service_unavailable) }
    assert_nil BillingWebhookEvent.last.processed_at
    provider.fail_fetch = false
    Billing::Provider.stub(:new, provider) { stripe_event("evt_retry", "customer.subscription.updated", { "id" => subscription.external_id }) }
    assert BillingWebhookEvent.last.processed_at
  end

  test "a mismatched customer cannot grant another company access" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote.merge("customer" => "cus_other_company")
    Billing::Provider.stub(:new, provider) { stripe_event("evt_wrong_company", "customer.subscription.updated", { "id" => subscription.external_id }, status: :service_unavailable) }
    assert_equal "starter", @workspace.reload.plan_key
  end

  test "Razorpay signed webhooks activate and then revoke a subscription" do
    subscription = create_subscription("razorpay")
    provider = FakeProvider.new("razorpay")
    provider.remote = { "id" => "sub_company", "plan_id" => "plan_growth", "status" => "active", "current_end" => 1.month.from_now.to_i, "notes" => { "workspace_id" => @workspace.id.to_s } }
    Billing::Provider.stub(:new, provider) do
      razorpay_event("rzp_active", "subscription.activated", subscription.external_id)
      assert_equal "growth", @workspace.reload.plan_key
      provider.remote["status"] = "halted"
      razorpay_event("rzp_halted", "subscription.halted", subscription.external_id)
    end
    assert_equal "starter", @workspace.reload.plan_key
    assert_equal "past_due", @workspace.billing_status
  end

  test "scheduled cancellation retains access until period end" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote
    Billing::Provider.stub(:new, provider) do
      post "/api/v1/billing/cancel", headers: @headers
      assert_response :success
    end
    assert subscription.reload.cancel_at_period_end
    assert_equal "growth", @workspace.reload.saas_plan.dig(:plan, :key)
    travel 32.days do
      assert_equal "starter", @workspace.reload.saas_plan.dig(:plan, :key)
    end
  end

  test "checkout for a second provider is blocked while a subscription exists" do
    create_subscription("stripe")
    post "/api/v1/billing/checkout", params: { provider: "razorpay", plan_key: "growth" }, headers: @headers
    assert_response :unprocessable_entity
  end

  test "enterprise checkout works without a growth price" do
    ENV.delete("STRIPE_GROWTH_PRICE_ID")
    provider = FakeProvider.new("stripe")
    Billing::Provider.stub(:new, provider) do
      post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "enterprise" }, headers: @headers
      assert_response :success
    end
    assert_equal "enterprise", @workspace.reload.billing_subscription.plan_key
  end

  test "invalid providers and expired sessions cannot create checkout" do
    post "/api/v1/billing/checkout", params: { provider: "unknown", plan_key: "growth" }, headers: @headers
    assert_response :unprocessable_entity
    @session.revoke!
    post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth" }, headers: @headers
    assert_response :unauthorized
    assert_equal 0, BillingSubscription.count
  end

  test "uncertain stripe checkout retries reuse the same attempt within its lifetime" do
    subscription = @workspace.create_billing_subscription!(provider: "stripe", plan_key: "growth", status: "checkout_unknown", attempt_key: "same-attempt", checkout_expires_at: 1.hour.from_now)
    provider = FakeProvider.new("stripe")
    Billing::Provider.stub(:new, provider) do
      post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth" }, headers: @headers
      assert_response :success
    end
    assert_equal "same-attempt", subscription.reload.attempt_key
    subscription.update!(status: "checkout_unknown", checkout_expires_at: 1.minute.ago)
    Billing::Provider.stub(:new, provider) do
      post "/api/v1/billing/checkout", params: { provider: "stripe", plan_key: "growth" }, headers: @headers
      assert_response :unprocessable_entity
    end
    assert_equal 1, provider.checkout_calls
  end

  test "reconciliation restores paid access after a missed webhook" do
    subscription = create_subscription("stripe")
    provider = FakeProvider.new("stripe")
    provider.remote = stripe_remote
    Billing::Provider.stub(:new, provider) { BillingReconciliationJob.perform_now }
    assert_equal "active", subscription.reload.status
    assert_equal "growth", @workspace.reload.plan_key
  end

  private

  def create_subscription(provider)
    @workspace.create_billing_subscription!(provider: provider, plan_key: "growth", external_id: "sub_company", customer_id: provider == "stripe" ? "cus_company" : nil, status: "pending")
  end

  def stripe_remote
    { "id" => "sub_company", "customer" => "cus_company", "status" => "active", "items" => { "data" => [{ "price" => { "id" => "price_growth" }, "current_period_end" => 1.month.from_now.to_i }] } }
  end

  def stripe_event(id, type, object, status: :success)
    body = JSON.generate(id: id, type: type, livemode: false, data: { object: object })
    timestamp = Time.now.to_i
    signature = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("STRIPE_WEBHOOK_SECRET"), "#{timestamp}.#{body}")
    post "/billing/webhooks/stripe", params: body, headers: { "Content-Type" => "application/json", "Stripe-Signature" => "t=#{timestamp},v1=#{signature}" }
    assert_response status
  end

  def razorpay_event(id, type, subscription_id)
    body = JSON.generate(event: type, payload: { subscription: { entity: { id: subscription_id } } })
    signature = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("RAZORPAY_WEBHOOK_SECRET"), body)
    post "/billing/webhooks/razorpay", params: body, headers: { "Content-Type" => "application/json", "X-Razorpay-Signature" => signature, "X-Razorpay-Event-Id" => id }
    assert_response :success
  end
end
