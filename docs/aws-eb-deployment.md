# AWS Elastic Beanstalk Deployment

This app is prepared for a low-cost Elastic Beanstalk single-instance deployment.

## First Launch Shape

- Elastic Beanstalk Ruby platform on Amazon Linux 2023.
- Single EC2 instance to avoid load balancer cost at the beginning.
- PostgreSQL through `DATABASE_URL`.
- Redis-compatible Valkey installed on the same EC2 instance for Action Cable and Sidekiq.
- Active Storage uploads in S3.
- Vite/Rails compiled assets served by the Rails/EB instance for the first launch.

## Environment Variables

Best place for production values:

1. Elastic Beanstalk environment properties for normal app configuration.
2. AWS Secrets Manager or SSM Parameter Store later for higher-security secrets.
3. Never commit real values to `.env`, `.ebextensions`, docs, or Git.

For the first low-cost deploy, EB environment properties are fine. Add them in:

`Elastic Beanstalk > your environment > Configuration > Updates, monitoring, and logging > Environment properties`

Required:

```text
RAILS_ENV=production
RACK_ENV=production
DATABASE_URL=postgresql://...
SECRET_KEY_BASE=...
BASE_URL=https://your-domain.com
APP_DOMAIN=your-domain.com
ALLOWED_HOSTS=your-domain.com,your-eb-env.elasticbeanstalk.com
ACTIVE_STORAGE_SERVICE=s3
S3_REGION=ap-south-1
S3_BUCKET=nexus-hub-production
REDIS_URL=redis://127.0.0.1:6379/1
WEB_CONCURRENCY=1
RAILS_MAX_THREADS=5
RAILS_MIN_THREADS=5
SEED_DEMO=false
```

Optional, depending on enabled features:

```text
POSTMARK_SERVER_TOKEN=
EMAIL_DELIVERY_METHOD=smtp
SMTP_ADDRESS=email-smtp.ap-south-1.amazonaws.com
SMTP_PORT=587
SMTP_DOMAIN=your-domain.com
SMTP_USERNAME=
SMTP_PASSWORD=
MAILER_SENDER=
ERROR_NOTIFICATION_EMAIL=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
CLOUDINARY_URL=
SENTRY_DSN=
SLACK_WEBHOOK_URL=
FIREBASE_PROJECT_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
PORTFOLIO_ADMIN_EMAIL=
PORTFOLIO_LINKEDIN_URL=https://www.linkedin.com/in/your-profile
RAILS_MASTER_KEY=
KEKA_API_KEY_ENCRYPTION_KEY=
```

Variables starting with `VITE_` are visible in browser JavaScript. Do not put server secrets in `VITE_` variables.

## S3 Bucket Plan

Use one private bucket per environment:

```text
nexus-hub-production
nexus-hub-staging
nexus-hub-development
```

Active Storage stores object keys internally. Do not manually move uploaded files into custom folders after upload, because Rails keeps the object key in the database.

Recommended S3 setup:

- Block all public access: on.
- Versioning: on.
- Default encryption: SSE-S3 or SSE-KMS.
- Lifecycle rule:
  - abort incomplete multipart uploads after 7 days
  - transition old noncurrent versions later if storage cost grows
- IAM access:
  - prefer the EB EC2 instance profile with permission to this bucket
  - avoid long-lived `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` when possible

If using an instance profile, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` can be left blank.

## Deploy Notes

The EB hooks do the following:

- install Linux packages needed by PostgreSQL, image processing, and PDF tools
- install Valkey on the same EC2 instance (Sidekiq 8 requires Redis 7+ or Valkey 7.2+)
- install Node from `.node-version`
- install Yarn 1.x
- install Ruby and JavaScript dependencies
- build Vite and Rails assets
- run `rails db:migrate` after deploy

The predeploy hook runs `rails app:bootstrap` (migrations and enabled seeds)
unless `RAILS_SKIP_MIGRATIONS=true`. `SEED_PORTFOLIO` defaults to true; configure
`PORTFOLIO_LINKEDIN_URL` to seed the public LinkedIn link. Other existing social
links are preserved. `SEED_DEMO` controls synthetic demo data independently of
public demo access.

For a manual bootstrap:

```bash
eb ssh
cd /var/app/current
SEED_DEMO=false bundle exec rails app:bootstrap
```

## HTTPS and Background Jobs

This single-instance environment terminates HTTPS in Nginx using Certbot.
Set `CERTBOT_ENABLE=true`, `CERTBOT_EMAIL`, and comma-separated `CERTBOT_DOMAINS`.
Both `.platform/hooks/postdeploy` and `.platform/confighooks/postdeploy` restore
the HTTPS listener. EB regenerates Nginx configuration during environment-variable
updates, so the configuration hook is required even when application code is unchanged.
EB checks `/up` over HTTP; Green health alone does not verify public HTTPS.

Production queues jobs through Sidekiq. The deployment hooks install and enable
`sidekiq.service` on the existing EC2 instance using EB's environment file and
the `webapp` user. `config/sidekiq.yml` sets two threads and consumes default,
mailer, and Active Storage queues. Predeploy hooks stop it gracefully; postdeploy
hooks restart it for both application releases and configuration updates.
No additional instance or load balancer is required.

`scripts/eb_install_valkey.sh` migrates a legacy Redis 6 snapshot without deleting
the original data, disables Redis 6, and enables Valkey on the same localhost
port. Append-only persistence and `noeviction` protect queued jobs. `REDIS_URL`
remains unchanged. The script refuses to overwrite existing Valkey data when
legacy Redis is still active.

Check the worker on the instance with `sudo systemctl status sidekiq` and inspect
logs with `sudo journalctl -u sidekiq -n 100`. Delayed jobs are handled by Sidekiq;
recurring jobs still need an explicit scheduler if the feature requires one.
Configure automatic certificate renewal and database backups separately; the EB
hooks do not install backup schedules or renewal timers.

`RAILS_MASTER_KEY` is needed when using encrypted Rails credentials. Keka falls
back to `SECRET_KEY_BASE` when its dedicated encryption key is absent; do not
change either encryption key after saving credentials. Sentry, Slack, Google
Sheets, and knowledge-feed API keys are optional integrations.

## Cost Notes

For lowest starting cost:

- use a single-instance EB environment
- use `t4g.medium` only if you need 4 GB RAM
- avoid load balancer until real traffic needs it
- keep Redis on-instance initially
- use budget alerts

When usage grows, move Redis to ElastiCache and PostgreSQL to RDS if they are not already managed.
