# Authentication uses the provider's signature on the exact raw request body.
class BillingWebhooksController < ActionController::API
  def create
    provider = params[:provider]
    signature = request.headers[provider == "stripe" ? "Stripe-Signature" : "X-Razorpay-Signature"]
    Billing::Webhook.call(provider: provider, raw_body: request.raw_post, signature: signature, event_id: request.headers["X-Razorpay-Event-Id"])
    head :ok
  rescue Billing::InvalidSignature
    head :bad_request
  rescue Billing::NotConfigured
    head :service_unavailable
  rescue Billing::Error, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    # A non-2xx response asks the provider to retry; failed events stay unprocessed.
    head :service_unavailable
  end
end
