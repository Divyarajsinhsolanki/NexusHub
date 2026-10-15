# Private files and PDF processing

## Delivery and ownership

Existing Rails blob redirect/proxy links now resolve to application streaming. A signed blob ID is only an identifier. Each read checks the current actor, active workspace membership, MFA where required, and the attached record:

- Workspace members can read workspace profile photos and posts.
- Chat files require active conversation participation; deleted messages and removed participants are denied. Scheduled attachments remain visible only to their sender.
- Issue media follows project access.
- PDFs, editor assets, versions and unexpired artifacts require the document/artifact owner. Workspace administrators do not automatically gain access to personal PDFs or private conversations.
- Only published portfolio records are public, while portfolio publishing is enabled. Unpublishing revokes access immediately.
- Unknown attachment types and unattached blobs fail closed. Internal operation snapshots are not download endpoints.

Delivery uses private/no-store responses, safe content disposition, and authorized range requests. Provider URLs are never returned by the file controller. Raw disk, direct-upload, preview and representation routes are retired. Automatic Active Storage analyzers/previewers are disabled. Render uploaded images in the browser; generate PDF thumbnails only through the PDF pipeline.

Native media requests exchange the blob identifier for a five-minute URL through the authenticated `/api/v1/file_access` endpoint. Every ticket read rechecks the mobile session, membership, MFA and record permissions. Revocation/offboarding invalidates outstanding tickets. An explicitly supplied bearer identity takes precedence over a ticket. Tickets are filtered from Rails parameter logs; configure proxy/APM logs to omit query strings as well. Native chat image and PDF disk caching are disabled. Authorized users can still save/share a copy deliberately.

Direct-upload reservations use `/api/v1/uploads`, followed by an authenticated raw-byte PUT to the returned application URL. The reservation belongs to one user/workspace, expires after 15 minutes, and accepts exactly the declared length and MD5. A successful upload is immutable; newly attached files are limited to 100 MiB (existing smaller per-feature limits also apply); signed IDs cannot attach unverified bytes or another user's reservation. Run `bin/rails private_files:cleanup_reservations` daily to purge abandoned, unattached reservations older than 24 hours. Multipart uploads remain supported.

## PDF process boundaries

In development/production, API imports and all operations execute in a fresh Rails subprocess. The parent coordinates the response or queued operation; existing sync/202 contracts are preserved. CPU time, 2 GiB address space, 128 MiB per output file, open file count, stdout/stderr, and a 300-second wall clock are bounded. Timeouts terminate the complete process group. Each execution uses a private temporary directory that the parent removes after success or termination. Run `bin/rails private_files:cleanup_unattached` daily to reclaim abandoned staging blobs older than 24 hours. Passwords and internal upload paths are passed through stdin, never process arguments or persistent job parameters. Access is rechecked in the child before processing. Failed operation leases prevent late publication.

This trusted publication subprocess has database/storage credentials because the existing pipeline publishes transactional versions and attachments. It is **not a credential-free parser sandbox**. Deploy the PDF worker separately, with network access limited to its database, queue and storage dependencies; do not co-locate it with unrelated secrets. The synchronous compatibility subprocess also runs under the web service's OS identity. Replacing that path with a remote job-only publication service would be a further architectural change.

PDF inspection and Poppler thumbnail/text/image rendering have a narrower Linux Bubblewrap boundary: no network, isolated namespaces, read-only Ruby/system runtime, explicit input files and private temporary output directories. Application configuration, home directory, storage root and server environment secrets are absent. Inspection enforces 50 MiB and 1–2000 pages. Missing/unsupported sandbox support fails closed; there is no unsandboxed production fallback. Retained encrypted files require unlocking before edits.

The Docker image installs Bubblewrap. Validate unprivileged user namespace support on the actual host; a container provider may forbid it. Do not enable privileged containers to work around a failure. Run the preflight below on the deployment target. `docker-compose.yml` includes a separate PDF worker with one processing slot, memory/CPU/PID limits and temporary storage limits. `config/sidekiq_pdf.yml` consumes `nexus_hub_production_pdf`; use the matching queue prefix outside production. General workers intentionally do not consume this queue. Existing enqueued default-queue operations can finish during rollout.

Unit/request tests keep transactional fixtures in the parent. The process integration test uses committed, dedicated records and exercises real subprocess import/edit/revoked-access handling; set `PDF_TEST_ISOLATED_EXECUTION=1` only for nontransactional end-to-end fixtures. Sandbox tests always exercise the real boundary.

## Storage rollout (before publishing)

1. Set production `ACTIVE_STORAGE_SERVICE=private_cloudinary` (the new default), or a private S3 bucket with public access blocked. Keep local storage outside `public/`. Do not retain `ACTIVE_STORAGE_SERVICE=cloudinary`: it is the legacy public service, retained only to read/migrate existing objects.
2. Inventory existing uploads. Run `SOURCE=cloudinary DESTINATION=private_cloudinary DRY_RUN=true bin/rails storage:migrate_service`. Review the output, then run without `DRY_RUN` in the authorized deployment window. Migration copies/verifies the destination before changing blob service metadata. It deliberately does not delete the source. Back up metadata and verify representative PDFs, images, audio and downloads first.
3. Remove/invalidate the former public provider objects/CDN URLs after the verified copy and backup. Changing Rails configuration or migrating blob rows does **not** revoke old public URLs. Do not consider the privacy rollout complete until unsigned old URLs fail. Provider ACLs and CDN invalidation require a separate production check.
4. Quarantine files from `public/uploads`, `public/documents`, and `public/temp_uploads` outside the webroot. Preview with `bin/rails private_files:quarantine_legacy`, then execute with `DRY_RUN=false bin/rails private_files:quarantine_legacy`. The command preserves bytes, records original paths/checksums in a private manifest, and rejects symlinks for manual review. Restore only after assigning a verified owner and importing into the private library; never restore files into the webroot. Existing unowned legacy PDF tokens/path downloads now return 410 with a re-upload instruction. Never infer an owner from a filename or token. The application blocks these public directories before Rails static serving; configure an external CDN/nginx/Caddy static origin to deny them too. No legacy files are deleted automatically.
5. Run `bin/rails private_files:audit` on the target. It checks legacy blob rows/public files, the selected default service, and actual sandbox startup. Also verify provider privacy and old CDN URL retirement independently; a local audit cannot attest to provider ACLs.
6. Start the dedicated PDF queue worker, test authenticated upload/read/range/edit/download, and verify logged-out, cross-user and offboarded requests fail. Check published portfolio screenshots and résumé downloads without a login. Schedule reservation cleanup.

Publishing, provider migration/deletion, and host configuration are separate deployment actions. No production objects are modified by this code change.
