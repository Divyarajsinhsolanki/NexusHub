# CSRF, CORS, CSP and browser/API protections

## Authentication boundaries and CSRF

Cookie-based `/api` writes, including login/signup, refresh, logout, MFA, invitations and contact submission, require Rails' CSRF token. Browser origins must match the application origin or an explicit trusted browser origin. An unknown or opaque (`null`) browser origin is rejected, and cross-site Fetch Metadata is rejected for cookie writes without an approved origin. A valid CSRF token is still required for approved origins; CORS permission alone never authorizes a write.

Every `/api/v1` route, including routes aliased to older web controllers, ignores browser/Devise cookies and uses bearer authentication for protected resources. Native public authentication and contact routes remain stateless. Native requests may have no Origin or `Origin: null`; they cannot fall back to a browser identity. Legacy root API bearer requests without browser credentials continue to work. Explicit invalid bearer credentials never fall back to cookies. Native refresh/logout continue using the explicit refresh capability. Signed billing webhooks remain outside CSRF checks and require the provider's signature on the raw body. MCP remains bearer/capability based and does not use browser login cookies.

Client browser CSRF headers are initialized from Rails' `csrf_meta_tags` and refreshed from `X-CSRF-Token` after login/logout. The browser session cookie and access/refresh cookies are HttpOnly; production cookies are Secure. Browser session/refresh cookies use SameSite=Lax and access cookies use SameSite=Strict.

## CORS and origin configuration

Set exact origins, including scheme and optional port:

- `BROWSER_ALLOWED_ORIGINS`: trusted browser frontend origins allowed to use cookie APIs. Browser CORS permits credentials and exposes `X-CSRF-Token` / `X-Request-Id`.
- `API_ALLOWED_ORIGINS`: trusted web frontends using native bearer APIs, or MCP browser clients. These routes never advertise credentialed CORS.
- `CORS_ALLOWED_ORIGINS`: compatibility fallback when the separate settings are absent.

Production defaults to no cross-origin callers. Wildcards, `null`, HTTP origins in production, embedded credentials and URL paths are rejected during startup. Development defaults allow common local frontend ports. Remove development origins when deploying. `CORS_ALLOWED_PATH` is retired: policies apply to fixed `/api/*`, `/api/v1/*` and `/mcp` routes with explicit method/header allowlists. An unapproved preflight receives no access-control approval. Server origin checks also reject unsafe unapproved requests before controller work, rather than relying solely on a browser hiding the response.

## Content Security Policy and browser headers

CSP is enforced, not report-only: default and base URI are same-origin, plugins/objects are disabled, framing is same-origin, forms submit same-origin, and scripts use first-party resources, per-response random nonces and explicit reCAPTCHA paths. Inline script handlers and eval are denied. Inline styles remain permitted because React, motion, charts, dialogs and PDF presentation rely on them.

PDF workers allow same-origin and blob workers. Images/media permit HTTPS and appropriate data/blob sources to preserve uploaded screenshots, avatars and call media. Connect sources explicitly cover existing knowledge feeds, Firebase Auth, reCAPTCHA, Cloudinary and the configured LiveKit service. Firebase uses the exact `VITE_FIREBASE_AUTH_DOMAIN`; `LIVEKIT_URL` must use WSS in production. `CSP_CONNECT_ORIGINS` adds explicitly trusted fetch origins, not script permissions. Development adds Vite's local HTTP/WebSocket endpoints; those are absent from production. Production upgrades insecure resource requests.

Rails emits nonce-bearing Vite script tags and structured-data scripts. All HTML uses `no-store` so cached markup cannot reuse a script nonce. API responses, including failures, use `no-store` and vary by Origin, Cookie and Authorization. Existing SEO metadata, public portfolio discovery, demo startup and résumé links are retained.

Headers include nosniff, SAMEORIGIN framing, strict-origin-when-cross-origin referrer policy, and permissions restricted to first-party camera/microphone with other unused capabilities denied. COOP uses `same-origin-allow-popups` for Firebase OAuth compatibility. COEP is intentionally absent because third-party uploads/media and OAuth are not cross-origin isolated. Production retains HTTPS/HSTS and requires explicit host configuration; a development tailnet host is no longer a production default.

## Verification and deployment

No database migration is required. Restart Rails after changing origins or CSP integrations; initializer changes do not hot reload. Configure production host variables (`APP_DOMAIN`, `BASE_URL`, Render host or `ALLOWED_HOSTS`) and exact HTTPS browser/API origins before deployment. Approved separate SPAs can bootstrap with credentialed `GET /api/csrf` and send its token as `X-CSRF-Token` before cookie writes; native clients need bearer credentials for all protected aliases.

Focused tests cover real CSRF enforcement, contact writes, token rotation, hostile origins, cookie fallback rejection, native opaque origins, allowed/denied preflights, nonce freshness, security headers and private cache control. A local Chrome check rendered the real login UI without CSP violations and confirmed an injected inline script was blocked. Third-party production Google/reCAPTCHA login and LiveKit calling still require a configured staging smoke test with those real services; local validation does not claim live-provider verification.

References: Rails security guide (https://guides.rubyonrails.org/security.html) and Rack::Cors configuration (https://github.com/cyu/rack-cors).
