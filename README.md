# Nexus Hub

Nexus Hub is a Rails 8 and React workspace for managing day-to-day product, project, and team operations. It has moved beyond the original sample-app stage and now includes authenticated dashboards, project and sprint planning, work logs, calendars, collaboration tools, knowledge cards, and PDF workflows.

The Rails app serves both the JSON API and the React entrypoint. Vite handles the React development server and production bundle.

## What It Does

- Authenticated workspace with Devise session cookies, roles, profiles, settings, notifications, and optional Firebase Google sign-in.
- Project and sprint management with task boards, sprint logs, issue tracking, members, project settings, and project vault items.
- Work-log and momentum views for daily planning, priorities, tags, notes, meetings, and progress review.
- Team features for departments, skills, endorsements, posts, comments, likes, chat, and mentions.
- Calendar events, reminders, Google calendar links, ICS import/export, and deadline tracking.
- Knowledge dashboard with coding tips, news, words, phrases, bookmarks, reminders, and optional third-party API feeds.
- PDF Master tools for upload, edit, annotate, sign, watermark, stamp, merge, split, compress, encrypt, decrypt, protect, export, undo, and redo.
- Optional Google Sheets integration for sprint tasks, logs, and issue imports.
- Optional Keka integration for attendance and employee details.
- Public one-page engineering portfolio with a Nexus Hub case study, feature gallery, resume/media administration, and a read-only guided demo.
- Workspace tenancy that isolates each signup and all business data behind workspace-scoped APIs, jobs, and realtime streams.

## Tech Stack

- Ruby 3.3.11
- Rails 8.0
- PostgreSQL
- React 18
- Vite 6 with `vite_rails`
- Yarn 1.x
- Tailwind CSS
- Devise authentication
- Google API client, optional Firebase sign-in, Action Cable, Active Storage

## Requirements

- Ruby `3.3.11` (`.ruby-version`)
- Bundler compatible with `Gemfile.lock` (`4.0.6` is currently locked)
- Node `24.18.0` (`.node-version`)
- Yarn `1.22.x`
- PostgreSQL
- ImageMagick for image handling used by PDF flows
- Poppler utilities for PDF image export (`pdftoppm`)
- Ghostscript and qpdf for advanced PDF operations
- Docker with the modern Compose plugin if you plan to use the container setup
- Docker if you plan to use local chat voice/video calls through LiveKit

On Ubuntu/Debian, the system packages are typically:

```bash
sudo apt-get install postgresql libpq-dev imagemagick poppler-utils ghostscript qpdf
```

## Local Setup

Make sure PostgreSQL is running, then run one idempotent command:

```bash
bin/setup
```

It creates `.env` when missing, installs Ruby and JavaScript dependencies,
prepares the database, and loads baseline, portfolio, and synthetic demo data.
It is safe to run again after pulling changes.

Local development uses `pdf_master_development` and `pdf_master_test` with the
default PostgreSQL credentials `postgres` / `postgres`. Override `DB_HOST` or
update `config/database.yml` when your PostgreSQL setup differs.

Start the app:

```bash
bin/dev
```

`bin/dev` starts Rails, the JavaScript build watcher, and the Vite dev server via
`Procfile.dev`. It also starts a local LiveKit media server when Docker is
available. Open `http://localhost:3000`.

Use `PORT=3001 bin/dev` to run on another port. Set `SEED_DEMO=false bin/setup`
when a local demo workspace is not wanted. Use `START_LIVEKIT=false bin/dev` if
you do not need voice/video calls during that run.

## Environment Variables

Environment variables are documented in `.env.example`. The most important groups are:

- App/runtime: `RAILS_MASTER_KEY`, `RAILS_LOG_LEVEL`, `RAILS_MAX_THREADS`, `RAILS_MIN_THREADS`, `WEB_CONCURRENCY`, `ALLOWED_HOSTS`
- Database: `DB_HOST`, `DATABASE_URL`
- Mail links and SMTP: `BASE_URL`, `FRONTEND_URL`, `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_DOMAIN`, `SMTP_USERNAME`, `SMTP_PASSWORD`
- CORS: `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_PATH`
- Action Cable: `REDIS_URL`
- Calls: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Rate limits: `RACK_ATTACK_LOGIN_PER_MINUTE`, `RACK_ATTACK_REQUESTS_PER_MINUTE`, `RACK_ATTACK_SIGNUP_PER_HOUR`
- Portfolio/demo: `PORTFOLIO_ENABLED`, `PORTFOLIO_ADMIN_EMAIL`, `DEMO_MODE_ENABLED`, `RACK_ATTACK_DEMO_PER_MINUTE`
- Contact form reCAPTCHA: `VITE_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`
- Knowledge cards and feeds: `VITE_GNEWS_API_KEY`, `VITE_NEWSAPI_KEY`, `VITE_FINANCIAL_MODELING_PREP_API_KEY`, `VITE_ALPHA_VANTAGE_API_KEY`, `VITE_NEWSDATA_API_KEY`, `VITE_GUARDIAN_API_KEY`, `VITE_WORDNIK_API_KEY`, `VITE_NASA_API_KEY`
- Firebase: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`
- Keka: `KEKA_API_KEY_ENCRYPTION_KEY`
- Slack notifications: `SLACK_WEBHOOK_URL`

Values prefixed with `VITE_` are exposed to browser-side JavaScript. Do not put
private server secrets in `VITE_` variables.

Keep `KEKA_API_KEY_ENCRYPTION_KEY` unchanged between deployments. If it changes,
existing Keka credentials become unreadable and must be entered again.

## Production Deployment

The Compose stack includes Rails web, Sidekiq, PostgreSQL, Redis, Caddy, and daily
PostgreSQL backups. Configure `.env` from `.env.example`, including
`POSTGRES_PASSWORD`, `SECRET_KEY_BASE`, `APP_DOMAIN`, and the S3-compatible
Active Storage settings.

```bash
bin/deploy
```

This validates required configuration, builds images, runs `bin/release`, starts
all services, waits for health checks, and prints service status. `bin/release`
handles database creation/migrations and all idempotent safe seeds.

For Render, Fly.io, Railway, or another platform with a release phase, configure:

```text
Build command: bin/render-build
Release command: bin/release
Start command: bin/rails server -b 0.0.0.0
```

Docker platforms without a release phase run `bin/release` automatically before
the Rails server starts. Keep `DEMO_MODE_ENABLED=false` until the deployment is
verified; the synthetic workspace can still be prepared safely. Set
`SEED_DEMO=false` to omit it entirely.

### Copy the local database to Render

This is destructive: it replaces the Render database. Suspend application
writes first and copy the **External Database URL** from the Render Postgres
Info page. The script creates a production backup before restoring local data.

```bash
CONFIRM_DATABASE_REPLACE=replace-render-database bin/copy-local-db-to-render
```

The script securely prompts for the Render External Database URL when it is not
already set.

Set `LOCAL_DATABASE_URL` too if the local database does not use the default
`postgresql://postgres:postgres@localhost/pdf_master_development` connection.
This copies PostgreSQL data only. Copy Active Storage objects separately when
local records reference uploaded files. When the installed PostgreSQL client is
too old, the script automatically uses the matching official PostgreSQL Docker
image.

## Google Sheets Integration

Google Sheets features are optional and are used for sprint task sheets, sprint log export, and issue imports.

To enable them:

1. Create a Google service account.
2. Download its JSON key.
3. Save it as:

   ```text
   config/google_service_account.json
   ```

4. Share each target spreadsheet with the service account email.
5. Add the spreadsheet IDs in the project settings screen.

`config/google_service_account.json` is intentionally ignored by Git.

## Useful Commands

```bash
bin/setup                         # install dependencies and prepare DB
bin/dev                           # run Rails, JS watcher, and Vite
bin/livekit status                # verify the local LiveKit media server
bin/livekit logs                  # inspect local LiveKit connection logs
bin/livekit stop                  # stop the local LiveKit container
bin/release                       # migrate and run required idempotent seeds
bin/deploy                        # build and deploy the complete Compose stack
bin/rails app:bootstrap           # database + all configured seed data
bin/rails db:prepare              # create/migrate database
bin/rails db:seed                 # seed starter data
bin/rails routes                  # inspect Rails routes
bin/rails demo:seed               # seed the synthetic read-only demo workspace
bin/rails test                    # run Rails model and request tests
yarn test                         # run Vitest UI and utility tests
RAILS_ENV=production bin/vite build
bin/rails assets:precompile
```

## Tests

Run the Rails workspace, portfolio, authorization, and demo request tests:

```bash
bin/rails test
```

Run the Vitest portfolio rendering and JavaScript utility tests:

```bash
yarn test
```

## Bootstrap Controls

The same seed flow is used locally, in CI, and in deployment:

- `SEED_PORTFOLIO=true` loads or refreshes the public portfolio.
- `SEED_DEMO=true` loads or refreshes synthetic demo data.
- `PORTFOLIO_ENABLED=true` exposes the portfolio, demo, and portfolio administration.
- `DEMO_MODE_ENABLED=true` permits visitors to start demo sessions.

When `PORTFOLIO_ENABLED` is false or absent, `/` displays the normal login/signup
flow and portfolio/demo routes and APIs are unavailable. Seeding demo data does
not enable public demo access. All seed operations are idempotent, so release
commands can be retried safely.

## Project Structure

- `app/javascript` - React app, pages, components, API client helpers, styles, and utility tests.
- `app/controllers` - Rails page controller, PDF controllers, and API controllers.
- `app/models` - Users, roles, projects, teams, tasks, logs, issues, calendar events, conversations, and integration models.
- `app/services` - Google Sheets, Keka, JWT, issue import, news, and other integration services.
- `app/jobs` - reminder and notification jobs.
- `db/migrate` - database schema changes.
- `db/seeds.rb` - safe baseline roles and workspace data.
- `docs` - feature notes and technical documentation.

## Troubleshooting

- `Could not find gem 'PdfMaster'`: confirm `vendor/pdf_master` exists and run `bundle install` again.
- PostgreSQL authentication errors: align `config/database.yml` with your local PostgreSQL username/password or create the expected `postgres` role with password `postgres`.
- PDF image export fails with `pdftoppm`: install Poppler utilities.
- Image processing fails in PDF flows: install ImageMagick and confirm `convert` or `magick` is available.
- Google Sheets errors: confirm `config/google_service_account.json` exists, the spreadsheet is shared with the service account, and the project has the correct sheet ID.
- Firebase token errors: verify both browser `VITE_FIREBASE_*` values and server-side `FIREBASE_PROJECT_ID`.
- Chat call error `Could not connect to the call media server`: run `bin/livekit status`. If it is not reachable, run `bin/livekit start` and confirm `.env` has `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, and the matching `LIVEKIT_API_SECRET`.
