## 1. Project scaffolding

- [x] 1.1 Initialize Nuxt 3 (TypeScript) project with Tailwind, Vitest, and Storybook configured
- [x] 1.2 Add scraping/parsing dependencies: `cheerio`, an XLSX parser (`exceljs` or `xlsx`), a KV client (`@vercel/kv` or `@upstash/redis`)
- [x] 1.3 Define the shared `Offer` TypeScript type per `specs/deal-catalog/spec.md` (integer-cent prices, `loyaltyTier`/`mechanic` enums, nullable fields, `productKey`/`offerKey`, `scope`)

## 2. Deal catalog (shared normalization layer)

- [x] 2.1 Implement unit-text normalization (case/whitespace/token-order) used before hashing `productKey`
- [x] 2.2 Implement `productKey` derivation: EAN-based when present, normalized name+unit-text fallback otherwise
- [x] 2.3 Implement `offerKey` derivation (`productKey` + `validFrom`)
- [x] 2.4 Implement catalog merge function that combines Kaufland + Lidl offer arrays into one deduplicated list, attaching `warnings` for any detected anomalies (e.g. unexpected store-level price divergence)
- [x] 2.5 Vitest: unit tests for normalization/key derivation, including the known real-data duplicate case (`"3 л/ 1455 г"` vs `"1455 г/ 3 л"`)



## 3. Kaufland ingestion

- [x] 3.1 Implement `server/utils/scrapers/kaufland.ts`: fetch `kaufland.bg/aktualni-predlozheniya/oferti.html` via `ofetch`, no custom headers/cookies beyond a standard user agent
- [x] 3.2 Implement `cheerio` parsing of product tiles into raw fields: brand, name, unit text, discount %, EUR/BGN prices, old price, loyalty tier, mechanic, purchase limit, category (from block headers)
- [x] 3.3 Implement per-block validity date extraction (base week vs named sub-campaigns), populating `validFrom`/`validUntil`/`campaign` per offer
- [x] 3.4 Implement EAN extraction from product image URL (nullable)
- [x] 3.5 Map raw parsed fields into the shared `Offer` schema (confirm no `productUrl` field is ever set)
- [x] 3.6 Capture a real HTML fixture (`oferti.html` snapshot) for tests; do not fetch live during test runs
- [x] 3.7 Vitest: fixture-based tests covering missing old price, loyalty-tier variants, EAN present/absent, multiple campaign blocks with different validity windows
- [x] 3.8 Error handling: on fetch/parse failure, throw/return a typed failure the cron job can catch without crashing the whole run



## 4. Lidl ingestion

- [x] 4.1 Implement `server/utils/scrapers/lidl.ts`: download `ExportSecondList.xlsx` via `ofetch`
- [x] 4.2 Implement XLSX row parsing into raw fields per the file's own columns (reference price, discounted price, validFrom, validUntil, percentage, product name, brand, quantity, category code)
- [x] 4.3 Implement filtering to rows with a non-empty current discounted price only
- [x] 4.4 Implement store-row deduplication into one national offer per product code + period; add divergence detection that attaches a warning if prices differ across store rows for the same product/period
- [x] 4.5 Map raw parsed fields into the shared `Offer` schema
- [x] 4.6 Capture a real XLSX fixture (trimmed subset of `ExportSecondList.xlsx`) for tests; do not fetch live during test runs
- [x] 4.7 Vitest: fixture-based tests covering rows without discounts (excluded), normal rows, and the deduplication/divergence-warning logic
- [x] 4.8 Error handling: on download/parse failure, throw/return a typed failure the cron job can catch without crashing the whole run



## 5. Snapshot cache and cron

- [x] 5.1 Implement `server/utils/kv.ts`: read/write the published snapshot in Vercel KV / Upstash Redis
- [x] 5.2 Implement the cron handler (`server/api/cron/*`) that runs both ingestion jobs, merges via the catalog layer, and writes a new snapshot only on at-least-partial success
- [x] 5.3 Implement partial-failure isolation: on one source failing, carry forward that source's last known-good offers into the new snapshot
- [x] 5.4 Implement total-failure guard: if both sources fail, leave the existing snapshot untouched and log the failure
- [x] 5.5 Configure Vercel Cron (daily, UTC) to hit the cron endpoint; protect the endpoint from public invocation (secret header/token check)
- [x] 5.6 Vitest: tests for partial-failure isolation and total-failure guard logic using mocked ingestion results



## 6. Browsing UI

- [x] 6.1 Configure `routeRules` for ISR on the deals page, reading the snapshot from KV
- [x] 6.2 Build the offer list/grid page with retailer, category, and price filters
- [x] 6.3 Build the offer card component showing retailer name and source attribution
- [x] 6.4 Handle the "stale snapshot" case gracefully (render latest available snapshot, no error state for normal staleness)
- [x] 6.5 Storybook stories for the offer card and filter controls, covering the schema's nullable-field variants (no old price, no loyalty tier, no EAN, no BGN price)



## 7. End-to-end verification

- [x] 7.1 Manually trigger the cron endpoint against real sources once in a non-production environment and confirm a valid snapshot is written
- [x] 7.2 Verify the page renders correctly from that snapshot via ISR, including all three filters
- [x] 7.3 Run `openspec validate add-deals-aggregator --strict` and fix any reported issues before archiving