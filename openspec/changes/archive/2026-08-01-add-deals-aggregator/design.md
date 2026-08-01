## Context

See `proposal.md` for motivation. Underlying facts referenced throughout this document were established during feasibility research and are recorded in full in `HANDOFF_parcer.md` at the repo root (sections 2 and 4) — this design does not re-derive them, only builds on them.

Key constraints inherited from that research:
- Kaufland's offers page is plain SSR HTML; Lidl's equivalent page is not (client-side JS renders the product grid), but Lidl separately publishes an official XLSX price-monitoring export that is SSR-equivalent for our purposes and requires no browser.
- Vercel Hobby plan: cron at most once/day, only guaranteed within the trigger hour, UTC only, 10s default function timeout.
- Nitro's default in-memory cache (`cachedEventHandler`/`useStorage()` with the `memory` driver) does not survive cold starts on serverless — confirmed against Nitro's own documentation.
- Both `robots.txt` files are clear for the paths this project touches; no anti-bot bypass is used or planned.
- Lidl pricing was verified to have zero cross-store variance for a given product code; Kaufland's equivalent was not technically verified (their store picker is a client-rendered SPA unreachable via plain HTTP) and is treated as an assumption, not a fact.

## Goals / Non-Goals

**Goals:**
- Produce one normalized offer schema that both scrapers populate, so the UI and cache layer never branch on retailer.
- Keep the production runtime free of headless browsers — all scraping in `server/api/*` uses `ofetch`/`cheerio`/an XLSX parser only.
- Make a stale or partially-failed scrape fail safe: the UI always has *something* to render, never a blank page or a 500 caused by an upstream hiccup.
- Keep the whole system operable within Vercel Hobby's constraints as the baseline, with an explicit escape hatch (external scheduler) if daily cron proves insufficient.

**Non-Goals:**
- Price history / time-series storage. The snapshot model here is a single rolling "latest" catalog, not an append-only ledger. Introducing history is a separate, materially larger change (persistent DB keyed by `productKey`, retention policy, migration of the KV-only approach) and is intentionally deferred — see Open Questions.
- Store-level (regional) pricing UI. The schema supports `scope: 'regional'` for forward-compatibility, but no ingestion path populates it yet since neither confirmed source requires it for v1.
- Any auth, user accounts, saved filters, or personalization. Single anonymous read-only page.
- Handling retailers beyond Lidl and Kaufland.

## Decisions

### 1. XLSX over Playwright for Lidl
**Decision:** Parse `ExportSecondList.xlsx` directly; do not build a Playwright-based scraper against `lidl.bg`.
**Why:** The XLSX is an official, legally-mandated export with pre-computed reference price, discounted price, and validity dates — it is a strictly better data source than reverse-engineering Lidl's internal API would have been, and carries no anti-bot risk since it's a public static file. This reverses the original plan's assumption (see `HANDOFF_parcer.md` §4.2).
**Alternative considered:** Headless-browser scraping of `lidl.bg/c/aktsiya/*` to intercept the XHR/fetch calls that hydrate the product grid. Rejected: adds a heavyweight dependency, a production-adjacent anti-bot risk, and duplicates data the XLSX already provides more cleanly. Kept only as a documented fallback if Lidl ever stops publishing the XLSX.

### 2. EAN-from-image-URL as a Kaufland identity signal
**Decision:** Parse the numeric segment out of the Kaufland product image URL (e.g. `8606018614950` from `.../8606018614950_BG_P`) and store it as `ean`, used as a secondary signal in `productKey` derivation when present.
**Why:** Name+unit-text matching alone was observed to produce false duplicates (same item, reordered unit tokens) and, in principle, false merges (different items, coincidentally similar names). A barcode-shaped identifier is a much stronger signal where available.
**Alternative considered:** Rely solely on normalized name+unit-text hashing. Kept as the fallback when `ean` is absent, since not every tile's image URL is guaranteed to encode one — but `ean` takes precedence when present.
**Trade-off:** The image URL itself is documented as short-lived/proxy-able; only the embedded numeric code is treated as stable, not the URL as a whole.

### 3. Store/scope model over per-offer store fields
**Decision:** `scope: 'national' | 'regional'` on each offer, with store details only attached when `scope === 'regional'`.
**Why:** Confirmed for Lidl, assumed for Kaufland, that store only affects assortment/availability, not price. Modeling store as a first-class per-offer field would have implied price variance that doesn't exist (for Lidl) or isn't verified (for Kaufland), and would have bloated every offer record.
**Alternative considered:** Full `storeId`/`storeName`/`city` on every offer, as in the original naive schema. Rejected after the Lidl data disproved the assumption it was built on.

### 4. Cron + external KV + ISR, not in-request caching
**Decision:** A scheduled job (Vercel Cron on Hobby, or GitHub Actions hitting a protected endpoint if that proves insufficient) runs both ingestion paths, normalizes and merges their output, and writes one JSON snapshot to external KV. The page uses `routeRules` ISR to read that snapshot; no request path ever calls a scraper.
**Why:** Nitro's default cache does not survive cold starts on Vercel's serverless runtime — this was the root cause of the original plan's caching bug. Moving persistence outside the Lambda process is the only fix that doesn't fight the platform.
**Alternative considered:** `cachedEventHandler`/`useStorage()` with the default `memory` driver (original plan). Rejected — confirmed broken by Nitro's own docs. A custom storage driver bound to `nitro.storage.cache` was also considered, but the explicit cron+KV+ISR split was preferred because it makes cache staleness observable and debuggable (one job, one snapshot, one write) rather than implicit in Nitro's caching internals.

### 5. Single shared normalized schema for both retailers
**Decision:** Both scrapers emit the same TypeScript `Offer` shape (integer cents, enum `loyaltyTier`, enum `mechanic`, nullable fields, `productKey`/`offerKey`), even though the two sources expose very different raw shapes (SSR HTML DOM vs. spreadsheet rows).
**Why:** Keeps the catalog-merge, cache, and UI layers retailer-agnostic. Retailer-specific quirks (Kaufland's dual EUR/BGN price tags, Lidl's per-row store duplication) are resolved inside each scraper, not leaked downstream.

## Risks / Trade-offs

- **[Risk]** Kaufland store-level price variance is unverified (their store picker requires JS to probe) → **Mitigation:** default `scope: 'national'` for Kaufland offers now; the `deal-catalog` spec's warning mechanism and this design's Non-Goals make it explicit that regional pricing is not yet handled, so a future correction is additive (populate `scope: 'regional'` + store data) rather than a breaking schema change.
- **[Risk]** Kaufland and Lidl markup/file formats can change without notice, silently breaking a parser → **Mitigation:** Vitest fixture tests pinned to captured real HTML/XLSX snapshots (per proposal), plus the "no snapshot published on total failure" and "partial-failure isolation" requirements in `deals-snapshot-cache` so a broken parser degrades to stale data, not a blank page.
- **[Risk]** Vercel Hobby's daily-cron ceiling and hour-only scheduling guarantee may be too coarse if fresher data is wanted later → **Mitigation:** the cron job's own logic (fetch → normalize → write snapshot) is decoupled from *how* it's triggered, so switching the trigger to GitHub Actions cron hitting a protected endpoint, or upgrading to Pro, requires no change to ingestion or catalog logic.
- **[Risk]** EAN extraction from the Kaufland image URL is a heuristic (pattern-matching a numeric segment), not a documented API contract → **Mitigation:** treated as a nullable, best-effort signal; `productKey` derivation still falls back to normalized name+unit-text when `ean` is absent, so a change in Kaufland's image URL format degrades identity quality rather than breaking ingestion.
- **[Trade-off]** The KV snapshot is a single rolling "latest" blob, not partitioned per retailer or paginated → acceptable at this data volume (~600–1200 Kaufland offers + ~3500 discounted Lidl rows per run, well within a single JSON document); revisit if either source's active-discount count grows by an order of magnitude.

## Migration Plan

This is a greenfield build (first change in the repo) — no data migration is needed. Deployment sequencing:
1. Land ingestion + normalization + catalog code with Vitest fixture coverage, behind no user-facing route yet.
2. Wire the cron job and KV storage; verify a snapshot can be produced and read back manually (e.g. via a temporary internal-only endpoint) before exposing the public page.
3. Land the `deals-browsing-ui` page reading from KV via ISR.
4. Enable the scheduled cron in production.

Rollback: since there's no prior version of this feature, "rollback" means disabling the cron trigger and/or removing the public route; no data cleanup is required beyond clearing the KV key if desired.

## Open Questions

- **Price history over time** — deferred by design (see Non-Goals). If wanted later, it requires persisting each `offerKey` over time in a real database (e.g. Postgres/Prisma) rather than overwriting a single KV snapshot; that's a separate change, not an extension of this one.
- **Vercel Hobby vs. Pro** — this design targets Hobby's constraints as the baseline (see Decision 4's fallback). Upgrading is a deployment/billing decision, not a code change, and doesn't need to block implementation.
- **Kaufland store-level pricing** — currently assumed `national`. Confirming this technically would require a headless-browser probe of the store picker (out of scope for this change, since it doesn't block shipping v1 with the `national` default already modeled).
