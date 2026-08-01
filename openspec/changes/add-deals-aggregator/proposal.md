## Why

There is currently no single place to see this week's Lidl Bulgaria and Kaufland Bulgaria discounts side by side. Both retailers publish this data on their own sites/files, but in incompatible formats (Kaufland: SSR HTML with per-block validity; Lidl: an official XLSX price-monitoring export, not the JS-rendered site). Phase 1–2 research (see `HANDOFF_parcer.md`) confirmed both sources are technically scrapable without violating robots.txt or bypassing anti-bot protections, and settled the open architectural questions (pricing schema, ID strategy, caching approach) against real data. This change builds the first working version: fetch both sources on a daily cron, normalize them into one schema, and serve a filterable "what's on sale this week" page for a Varna-based personal user.

## What Changes

- Add a Kaufland scraper (`server/api` job) that fetches `kaufland.bg/aktualni-predlozheniya/oferti.html` and parses product tiles via `cheerio` into normalized offers, including EUR+BGN prices, loyalty tier, mechanic, per-block validity, and an EAN extracted from the image URL where present.
- Add a Lidl scraper (`server/api` job) that downloads and parses `ExportSecondList.xlsx` (the official ЗУПА price-monitoring file) into normalized offers, using the pre-computed reference price, discounted price, and validity dates — no HTML/JS scraping and no headless browser for Lidl.
- Add a shared normalization layer: integer-cents pricing, two-level ID scheme (`productKey` stable across weeks, `offerKey` = `productKey` + `validFrom`), unit-text normalization to prevent token-order duplicates, and a `store`/`scope` model (`national` | `regional`) instead of per-offer store duplication.
- Add a daily cron job that runs both scrapers and writes a combined JSON snapshot to external KV (Vercel KV / Upstash Redis), since Nitro's default in-memory cache does not survive serverless cold starts.
- Add a Nuxt SSR page (ISR via `routeRules`) that reads the latest snapshot from KV and renders a filterable list (retailer, category, price) with source attribution per offer. No user request ever triggers live scraping.
- Add automated tests (Vitest) against captured real HTML/XLSX fixtures for both parsers, covering the known real-data edge cases already found in research (duplicate items with reordered unit tokens, missing original price, missing loyalty tier, per-block validity dates).

Explicitly out of scope for this change (see design.md "Open Questions"):
- Price history over time (would require persistent storage keyed by `productKey` beyond a single rolling snapshot — a different architecture from the KV-snapshot approach here).
- Store-level price differentiation for Kaufland (assumed `national` scope by default; not technically verified — see design.md risks).
- Any Vercel Pro-only capability (more frequent cron, longer function timeout) — this change targets Hobby-plan constraints as the baseline.

## Capabilities

### New Capabilities
- `kaufland-offer-ingestion`: Fetching and parsing Kaufland's public offers page into normalized offer records.
- `lidl-offer-ingestion`: Fetching and parsing Lidl's official XLSX price-monitoring export into normalized offer records.
- `deal-catalog`: Shared normalization schema, product/offer identity (dedup keys), and merging of both sources into one catalog.
- `deals-snapshot-cache`: Daily cron orchestration and KV-backed snapshot storage/retrieval, decoupling scraping from user requests.
- `deals-browsing-ui`: The Nuxt page and filtering UI (retailer, category, price) that renders the cached catalog for the end user.

### Modified Capabilities
(none — this is the first change in the repo)

## Impact

- New code: `server/api/cron/*`, `server/utils/scrapers/kaufland.ts`, `server/utils/scrapers/lidl.ts`, `server/utils/normalize.ts`, `server/utils/kv.ts`, `pages/index.vue` (or equivalent), `nuxt.config.ts` (`routeRules` for ISR, cron config).
- New dependencies: `cheerio`, `ofetch` (likely already present via Nuxt), an XLSX parser (e.g. `exceljs` or `xlsx`), a KV client (`@vercel/kv` or `@upstash/redis`).
- New external dependencies: Vercel Cron (or GitHub Actions cron hitting a protected endpoint, if Hobby's daily-cron ceiling proves too coarse later), Vercel KV / Upstash Redis.
- No existing specs are modified since this is the first change in the repo.
