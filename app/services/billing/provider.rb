require "net/http"
require "json"
require "openssl"

module Billing
  class Provider
    def initialize(name)
      raise Error, "Unsupported payment provider." unless Configuration::PROVIDERS.include?(name)
      @name = name
    end

    def checkout(subscription, user)
      Configuration.ensure_configured!(@name, subscription.plan_key)
      plan_id = Configuration.plan_id(@name, subscription.plan_key)
      if @name == "stripe"
        customer = subscription.customer_id || request(:post, "/customers", { "email" => user.email, "metadata[workspace_id]" => subscription.workspace_id }, idempotency: "workspace-customer-#{subscription.workspace_id}").fetch("id")
        subscription.update!(customer_id: customer)
        response = request(:post, "/checkout/sessions", {
          "mode" => "subscription", "customer" => customer,
          "line_items[0][price]" => plan_id, "line_items[0][quantity]" => 1,
          "client_reference_id" => subscription.workspace_id,
          "subscription_data[metadata][workspace_id]" => subscription.workspace_id,
          "subscription_data[metadata][attempt_id]" => subscription.attempt_key,
          "success_url" => "#{Configuration.return_url}?billing=success",
          "cancel_url" => "#{Configuration.return_url}?billing=canceled"
        }, idempotency: "checkout-#{subscription.id}-#{subscription.attempt_key}")
        { checkout_id: response.fetch("id"), checkout_url: response.fetch("url"), checkout_expires_at: Time.at(response.fetch("expires_at")) }
      else
        cycles = Integer(ENV.fetch("RAZORPAY_SUBSCRIPTION_CYCLES"), exception: false)
        raise NotConfigured, "Configure a positive Razorpay subscription cycle count." unless cycles && cycles.positive?
        # Razorpay subscriptions have a finite number of recurring cycles.
        response = request(:post, "/subscriptions", {
          plan_id: plan_id, total_count: cycles, quantity: 1, customer_notify: true,
          expire_by: 23.hours.from_now.to_i,
          notes: { workspace_id: subscription.workspace_id.to_s, attempt_id: subscription.attempt_key }
        })
        { external_id: response.fetch("id"), checkout_id: response.fetch("id"), checkout_url: response.fetch("short_url"), checkout_expires_at: Time.at(response.fetch("expire_by")) }
      end
    rescue KeyError, TypeError
      raise Error, "The provider returned an incomplete checkout. Refresh billing before retrying."
    end

    def fetch_subscription(id)
      Configuration.ensure_configured!(@name)
      request(:get, "/subscriptions/#{CGI.escape(id)}")
    end

    def cancel(subscription)
      Configuration.ensure_configured!(@name, subscription.plan_key)
      if @name == "stripe"
        request(:post, "/subscriptions/#{CGI.escape(subscription.external_id)}", { cancel_at_period_end: true })
      else
        request(:post, "/subscriptions/#{CGI.escape(subscription.external_id)}/cancel", { cancel_at_cycle_end: subscription.status == "active" ? 1 : 0 })
      end
    end

    def portal(subscription)
      Configuration.ensure_configured!(@name, subscription.plan_key)
      raise Error, "Razorpay subscriptions are managed here; no Stripe portal is available." unless @name == "stripe"
      raise Error, "No billing customer is available." if subscription.customer_id.blank?
      request(:post, "/billing_portal/sessions", { customer: subscription.customer_id, return_url: Configuration.return_url }).fetch("url")
    end

    def expire_checkout(id)
      raise Error, "Unsupported checkout expiration." unless @name == "stripe"
      request(:post, "/checkout/sessions/#{CGI.escape(id)}/expire")
    end

    def subscription_from_checkout(id)
      request(:get, "/checkout/sessions/#{CGI.escape(id)}")["subscription"]
    end

    def verify_event(raw_body, signature)
      secret = ENV["#{@name.upcase}_WEBHOOK_SECRET"].presence
      raise NotConfigured, "Webhook verification is not configured." unless secret
      if @name == "stripe"
        parts = signature.to_s.split(",").map { |part| part.split("=", 2) }
        timestamp = parts.find { |key, _| key == "t" }&.last
        valid_time = timestamp.to_s.match?(/\A\d+\z/) && (Time.now.to_i - timestamp.to_i).abs <= 300
        expected = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{timestamp}.#{raw_body}")
        valid = valid_time && parts.any? { |key, digest| key == "v1" && digest.present? && ActiveSupport::SecurityUtils.secure_compare(expected, digest) }
      else
        expected = OpenSSL::HMAC.hexdigest("SHA256", secret, raw_body)
        valid = signature.present? && ActiveSupport::SecurityUtils.secure_compare(expected, signature)
      end
      raise InvalidSignature, "Invalid webhook signature." unless valid
      event = JSON.parse(raw_body)
      raise InvalidSignature, "Invalid webhook payload." unless event.is_a?(Hash)
      if @name == "stripe" && event["livemode"] != (Configuration.mode == "live")
        raise InvalidSignature, "Webhook environment mismatch."
      end
      event
    rescue JSON::ParserError
      raise InvalidSignature, "Invalid webhook payload."
    end

    private

    def request(method, path, payload = {}, idempotency: nil)
      base = @name == "stripe" ? "https://api.stripe.com/v1" : "https://api.razorpay.com/v1"
      uri = URI("#{base}#{path}")
      req = method == :get ? Net::HTTP::Get.new(uri) : Net::HTTP::Post.new(uri)
      if @name == "stripe"
        req["Stripe-Version"] = ENV.fetch("STRIPE_API_VERSION", "2025-03-31.basil")
        req["Authorization"] = "Bearer #{ENV.fetch('STRIPE_SECRET_KEY')}"
        req["Idempotency-Key"] = idempotency if idempotency
        req.set_form_data(payload.transform_values(&:to_s)) unless method == :get
      else
        req.basic_auth(ENV.fetch("RAZORPAY_KEY_ID"), ENV.fetch("RAZORPAY_KEY_SECRET"))
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(payload) unless method == :get
      end
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 15) { |http| http.request(req) }
      raise Error, "The payment provider could not complete the request. Please try again." unless response.is_a?(Net::HTTPSuccess)
      parsed = JSON.parse(response.body)
      raise Error, "The provider returned an invalid response." unless parsed.is_a?(Hash)
      parsed
    rescue Timeout::Error, SocketError, IOError, SystemCallError, JSON::ParserError => error
      raise Error, "The payment provider is temporarily unavailable."
    end
  end
end
