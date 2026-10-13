# Workspace subscriptions

Web and mobile Settings share the owner-only `/api/billing` and `/api/v1/billing` endpoints. Members, demo accounts, and impersonated sessions cannot manage billing. Hosted checkout supports Stripe or Razorpay, Growth or Enterprise. Redirects alone never grant paid access: verified webhooks and server-side provider reads determine entitlement.

## Configure and release

1. Run Rails migrations, including `20270826000000_create_billing_subscriptions`.
2. Copy the billing entries in `.env.example` into the server secret manager. Start with `BILLING_MODE=test`; credentials must match that mode. Never expose secrets in mobile or web bundles.
3. Create recurring Stripe prices and Razorpay subscription plans for Growth and/or Enterprise. Set their corresponding IDs. The checkout provider's actual recurring amount, currency, and interval are authoritative; align these with your advertised catalog before launch. Enterprise needs a configured recurring plan despite its custom-price catalog label.
4. Set `BILLING_RETURN_URL` to your HTTPS Settings URL, without query or fragment. Stripe returns there; mobile users return to the app and billing refreshes on foreground.
5. Register Stripe's webhook URL `/billing/webhooks/stripe` for `checkout.session.completed` and subscription created/updated/deleted events. Register `/billing/webhooks/razorpay` for subscription lifecycle events. Set each endpoint's signing secret. Events must reach the same database as checkout.
6. Enable Stripe's hosted billing portal, including the permitted plan changes and payment-method management. Razorpay provides hosted checkout and cancellation here, but no generic customer portal; switching an existing Razorpay plan requires cancellation and waiting for its entitlement to end before a new checkout.
7. Run Sidekiq with the default queue. Restart it after deployment so its 15-minute billing reconciliation schedule loads. This recovers missed lifecycle webhooks; failed rows are retried on the next run.
8. Exercise both providers in their test environments: payment success/failure, renewal, cancellation, expired checkout, duplicate webhook, return navigation, and provider dashboard state. Then configure live credentials and live IDs in the production environment. Keep test subscriptions separate from live data.

The Stripe API version defaults to `2025-03-31.basil`; override `STRIPE_API_VERSION` only after checking subscription period fields and testing the integration. Razorpay `RAZORPAY_SUBSCRIPTION_CYCLES` is a positive finite number of recurring cycles; set it deliberately for the configured interval.

## Failure handling

Duplicate pending checkout calls reuse the hosted link. Uncertain Stripe requests reuse their attempt's idempotency key within the safe retry window. Uncertain Razorpay creates cannot safely be repeated: retain the local attempt and reconcile its provider subscription using the workspace/attempt notes, or wait for its verified webhook. Do not delete the local record and create another subscription blindly.

Active cancellation retains access through the current paid period. Past-due/halted or ended subscriptions lose paid entitlement. Legacy manually assigned workspace plans retain their existing behavior until a billing subscription exists. Scheduled reconciliation runs only for configured nonterminal subscriptions; unknown checkouts without a provider identifier need provider-side investigation.

No live payment was made during implementation. Real provider credentials, webhook delivery, dashboard configuration, and Android/iOS checkout-return behavior still require environment testing.

References: [Stripe Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions), [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature), [Razorpay subscriptions](https://razorpay.com/docs/payments/subscriptions/).
