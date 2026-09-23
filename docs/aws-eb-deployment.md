# AWS Elastic Beanstalk Deployment

This app is prepared for a low-cost Elastic Beanstalk single-instance deployment.

## First Launch Shape

- Elastic Beanstalk Ruby platform on Amazon Linux 2023.
- Single EC2 instance to avoid load balancer cost at the beginning.
- PostgreSQL through `DATABASE_URL`.
- Redis installed on the same EC2 instance for Action Cable and Sidekiq.
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
RAILS_MASTER_KEY=...
BASE_URL=https://your-domain.com
APP_DOMAIN=your-domain.com
ALLOWED_HOSTS=your-domain.com,your-eb-env.elasticbeanstalk.com
ACTIVE_STORAGE_SERVICE=s3
S3_REGION=ap-south-1
S3_BUCKET=nexus-hub-production
REDIS_URL=redis://127.0.0.1:6379/1
KEKA_API_KEY_ENCRYPTION_KEY=...
WEB_CONCURRENCY=1
RAILS_MAX_THREADS=5
RAILS_MIN_THREADS=5
SEED_DEMO=false
```

Optional, depending on enabled features:

```text
POSTMARK_SERVER_TOKEN=
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
- install Redis on the same EC2 instance
- install Node from `.node-version`
- install Yarn 1.x
- install Ruby and JavaScript dependencies
- build Vite and Rails assets
- run `rails db:migrate` after deploy

Seeds are not run automatically on every EB deploy. Run seed/bootstrap manually only when needed:

```bash
eb ssh
cd /var/app/current
SEED_DEMO=false bundle exec rails app:bootstrap
```

## Cost Notes

For lowest starting cost:

- use a single-instance EB environment
- use `t4g.medium` only if you need 4 GB RAM
- avoid load balancer until real traffic needs it
- keep Redis on-instance initially
- use budget alerts

When usage grows, move Redis to ElastiCache and PostgreSQL to RDS if they are not already managed.
