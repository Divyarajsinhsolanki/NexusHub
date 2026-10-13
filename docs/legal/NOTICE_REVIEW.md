# Legal notice facts and release review

The owner confirmed this is a personal site. The public page identifies Divyarajsinh Solanki as the individual operator, without inventing a company, registration number, business address, governing jurisdiction, or refund guarantee.

Public build variables in `.env.example` allow operator/contact corrections. Confirm the public contact form at `VITE_LEGAL_CONTACT_URL` delivers messages; configure a monitored `VITE_LEGAL_CONTACT_EMAIL` if preferred. Add a contact address where appropriate for the actual audience and local obligations. Rebuild web assets after changing these variables. Mobile Settings → Security opens the same public `/legal` page.

The notice describes implemented flows, not a certification of legal compliance. Deployment-specific facts still need the operator's verification: enabled hosts and vendor regions, backup/log/storage-version retention, vendor terms and transfer arrangements, billing/tax/refund agreements, and applicable local privacy duties. No specific backup/log expiry is promised because this repository does not establish a universal deployed deletion policy.

Code references: `Accounts::Lifecycle` (seven-day deletion, ownership transfer, anonymous history, failure states), `Accounts::Export` (personal records and one-hour upload links), `Billing::Lifecycle` (provider-managed payments and access), Active Storage services (local/Cloudinary/S3), push delivery (Expo/Firebase), LiveKit calls, optional Sentry/Postmark/SMTP, and `Knowledge::DailyPublisher` (Bedrock sends technical topics and prior generated titles).

No promise of universal end-to-end encryption, immediate backup erasure, or vendor AI-training exclusion was added. Optional integrations are described conditionally. Review this notice when enabling another vendor or changing processing/retention.

Reference for notice structure: [ICO privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/). Applicability depends on the actual operator and audience; the page does not claim a particular jurisdiction applies to all users.
