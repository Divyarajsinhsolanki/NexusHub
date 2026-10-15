# Email design refresh

Open [the preview index](index.html) to review all examples. These are synthetic local renders; no emails were sent.

The refresh uses a responsive 600px layout, Nexus Hub branding, readable headings and detail cards, solid-color action buttons, copyable fallback URLs, and plain-text alternatives. Layout tables, inline styles and Outlook width fallbacks keep the design independent of external assets or fonts.

| Example | Desktop | Mobile |
| --- | --- | --- |
| Password reset | [Preview](password-reset-800.png) | [Preview](password-reset-375.png) |
| Workspace invitation | [Preview](invitation-800.png) | [Preview](invitation-375.png) |
| Account deletion verification | [Preview](account-deletion-800.png) | [Preview](account-deletion-375.png) |
| Calendar reminder | [Preview](calendar-800.png) | [Preview](calendar-375.png) |
| Issue update | [Preview](issue-800.png) | [Preview](issue-375.png) |
| Missed call | [Preview](missed-call-800.png) | [Preview](missed-call-375.png) |
| Knowledge reminder | [Preview](knowledge-800.png) | [Preview](knowledge-375.png) |
| Operations reminder | [Preview](operations-800.png) | [Preview](operations-375.png) |
| Confirmation | [Preview](confirmation-800.png) | [Preview](confirmation-375.png) |
| Privacy verification | [Preview](privacy-verification-800.png) | [Preview](privacy-verification-375.png) |
| Privacy update | [Preview](privacy-update-800.png) | [Preview](privacy-update-375.png) |
| Application error | [Preview](error-800.png) | [Preview](error-375.png) |
| Lambda production alert | [Preview](lambda-alert-800.png) | [Preview](lambda-alert-375.png) |
| Lambda link report | [Preview](lambda-link-checker-800.png) | [Preview](lambda-link-checker-375.png) |
| Lambda successful check | [Preview](lambda-success-800.png) | [Preview](lambda-success-375.png) |
| Lambda setup test | [Preview](lambda-test-800.png) | [Preview](lambda-test-375.png) |

App mailers share the mailer layout and MailerHelper. Devise inherits that layout through ApplicationMailer. Both SES Lambda bundles include infrastructure/email_templates.py and send the existing text body alongside styled HTML. Trigger conditions, schedules, recipients and token handling are preserved.

Validation: all twelve app variants render as multipart email; security links and escaped content are checked. Existing authentication, invitation, account-lifecycle and privacy flows were checked; multipart assertions were updated for the new HTML alternatives. Python tests cover both Lambda senders, alert/test/success/unverified states, escaped content, malformed URLs and deployment packaging. Browser previews at 800px and 375px have no horizontal overflow. Actual Gmail/Outlook rendering still needs mailbox testing.

Changes are local. Deploy the Rails changes and rebuild/deploy both Lambda bundles to activate the new design. No AWS configuration or live email delivery was performed.
