# Portfolio application screenshots

Captured from the running application on 9 October 2026 at 1600 × 1000 using the
synthetic read-only demo. These are real UI captures, not interface mockups.

| Asset | Screen |
| --- | --- |
| 01-project-delivery.webp | Showcase project delivery dashboard |
| 02-planning-focus.webp | Planning, calendar and current priorities |
| 03-collaboration.webp | Release Readiness team, people and skills |
| 04-knowledge-learning.webp | Knowledge library / ChatGPT inbox |
| 05-pdf-workflows.webp | PDF Master and its seeded document library |
| 07-project-operations.webp | Environment configuration and comparison |
| 06-platform-engineering.webp | Settings / Workspace plan and platform modules |

The same assets feed the portfolio Feature Map, project cover, guided tour,
synthetic post attachments and Project Vault media previews. The project preview
poster and MP4/WebM loop also show these current application screens.

To recapture with a locally installed Playwright package and Google Chrome:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright BASE_URL=http://localhost:3000 \
  OUTPUT_DIR=/tmp/nexus-ui-capture node scripts/capture_portfolio.cjs
```

The script authenticates through the demo endpoint and never uses a personal
account. Convert the resulting PNG captures to WebP in `app/assets/images/portfolio`
with an explicit encoder, for example:

```sh
ffmpeg -y -i /tmp/nexus-ui-capture/01-project-delivery.png -frames:v 1 \
  -c:v libwebp -lossless 1 app/assets/images/portfolio/01-project-delivery.webp
```

For the animated preview, concatenate the seven captures at 2.5 seconds per
screen, encode MP4 and WebM in `public/media/nexus`, and update the content-version
queries in `PublicPortfolio.jsx`. Copy the delivery WebP to
`app/javascript/images/nexus/nexus-product-poster.webp`.
Then run `bin/rails portfolio:seed` and `bin/rails demo:seed` to refresh bundled
attachments and media references. Custom uploads are preserved. Screenshot URLs
include a content version; unversioned image requests revalidate their cache.
