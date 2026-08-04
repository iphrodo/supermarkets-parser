## Context

Kaufland and Lidl ingestion (see `server/utils/scrapers/kaufland.ts`, `lidl.ts`) both parse structured data: Kaufland has JSON embedded in server-rendered HTML, Lidl has an official XLSX export. Billa has neither. Investigation of `billa.bg` found:

- Billa's Nuxt.js webshop routes (e.g. `/products`, referenced in its own `sitemap.xml`) 404 in a real browser — the e-commerce feature flags present in its Nuxt config are not live for the Bulgarian market.
- The only public promotions surface is `https://www.billa.bg/promocii/sedmichna-broshura` ("weekly leaflet"), which embeds a link to a **Publitas** publication (`publitas.com/billa-bulgaria/<slug>/`) via `view.publitas.com/embed.js`. The slug changes weekly (e.g. `bg_weekly_digital_leaflet_30-07-05-08-2026_cw31_web`).
- Fetching the `publitas.com/<account>/<slug>/` URL directly with a plain HTTP GET returns 404 — the actual reader content is loaded client-side by the embed script from `view.publitas.com`, which was not yet reverse-engineered at spec time.

This ingestion path is fundamentally different from the other two: it depends on a third-party catalog-hosting platform we don't control, and it requires converting page images into structured offers rather than parsing already-structured data.

## Goals / Non-Goals

**Goals:**
- Reliably find the current week's Billa leaflet without hardcoding a publication identifier.
- Convert leaflet page images into `Offer` records with the same shape as Kaufland/Lidl.
- Never publish a low-confidence extraction (wrong price, wrong date) into the catalog silently.
- Avoid re-running (and re-paying for) OCR/vision extraction when the leaflet hasn't changed since the last successful run.

**Non-Goals:**
- My Market ingestion (explicitly deferred, tracked separately if ever picked up).
- Per-store/regional Billa offers — leaflet content is assumed national unless proven otherwise (mirrors Lidl's verified-national approach).
- Reproducing Billa's own product catalog/SKU IDs — Billa doesn't expose one, so `productKey` is derived the same way as for Lidl/Kaufland (name + unit text, normalized).

## Decisions

### Publication discovery: parse the promotions page, not a fixed URL
Fetch `https://www.billa.bg/promocii/sedmichna-broshura` with a plain HTTP GET (same posture as Kaufland: no headless browser needed for this step, since the Publitas link is present in the initial server-rendered HTML) and extract the link matching the weekly-leaflet slug pattern (distinguishing it from the other Publitas links on that page for T&Cs, game rules, etc., which share the same `publitas.com/billa-bulgaria/` prefix but not the `weekly_digital_leaflet` naming convention). Store the resolved slug so subsequent steps and the change-detection check (below) can reuse it.

**Alternative considered:** guessing the slug from a date-based naming convention. Rejected — the slug format isn't strictly guaranteed (it already mixes date ranges, calendar week, and a `_web` suffix) and would silently break the moment Billa's naming convention shifts.

### Page image retrieval: reverse-engineered Publitas reader endpoint, headless browser as fallback
Investigate `view.publitas.com`'s reader for a JSON manifest of page image URLs (many digital-flyer platforms expose one to the client even when the outer wrapper page is script-rendered). Implement against that endpoint if found, since it avoids running a browser in the cron job.

If no such endpoint is discoverable, fall back to Playwright (already a project dependency for browser-based tests) to load the reader and capture page image URLs from network responses. This is heavier for a serverless cron function, so it's the fallback, not the default: if this path is required, package size/cold-start impact on the Vercel cron function must be re-evaluated as part of that task (e.g. a serverless-optimized Chromium build), and is called out explicitly in tasks.md rather than assumed away.

Either way, only publicly reachable Publitas endpoints are used — no authentication bypass, no anti-bot evasion — consistent with the existing scrapers' posture (see `kaufland-offer-ingestion`'s "no evasion" requirement).

### Extraction: multimodal vision API prompted for structured JSON, not OCR-then-regex
Use a hosted multimodal vision API (e.g. Claude vision) to extract each page's offers directly into structured fields (product name, unit text, price, discount, validity dates) with an explicit per-field confidence/uncertainty signal, rather than running raw OCR (e.g. Tesseract) and then regex-parsing the text output.

**Rationale:** Billa's leaflet, like most retail flyers, uses a graphic layout (price bubbles, badges, multi-column product blocks) rather than linear text — raw OCR output loses the spatial association between a product's name and its price bubble, forcing fragile heuristics to re-associate them. A vision-capable model can be instructed to reason over the layout directly and to report when it isn't confident about a field, which raw OCR has no native concept of. This confidence signal is required by the `billa-offer-ingestion` spec's confidence-gating requirement.

**Alternative considered:** Tesseract.js (pure-JS/WASM, no native binary, fits serverless well). Rejected as the primary approach because it has no confidence-per-field concept suitable for gating, and layout-heavy flyers are a known weak point for line-based OCR engines.

### Change detection: skip re-extraction when the publication hasn't changed
Persist the last successfully-processed publication slug (alongside the existing snapshot storage). On each scheduled run, if the discovered slug matches the last-processed one, skip page fetch and extraction entirely and keep the existing Billa offers (refreshing only `scrapedAt`-adjacent bookkeeping as needed) rather than re-running (and re-paying for) vision extraction on unchanged content.

### Wiring
- `shared/types/offer.ts`: add `'billa'` to `Retailer`; add a `billa` entry to `DealsSnapshot.sources`.
- `server/utils/scrapers/billa.ts`: exports `fetchBillaOffers()` (network + vision calls) and a separately-testable parse/normalize function, mirroring the `fetchXOffers()` / `parseXHtml()` split used by `kaufland.ts` and `lidl.ts`, so unit tests can feed fixture images/vision-response JSON without hitting the network or the vision API.
- `server/utils/sync.ts`, `server/api/cron/*.ts`: add `fetchBillaOffers` alongside the existing two, following the same partial-failure isolation already specified in `deals-snapshot-cache`.

### Scheduling: local catch-up on server start instead of Vercel cron
Decided against deploying to Vercel, so `vercel.json`'s daily cron trigger no longer exists. The hosting model is now a server started intermittently by hand on the developer's machine. To still approximate a twice-weekly schedule (Monday and Thursday, 10:00 Kyiv time — chosen to match the leaflet's weekly refresh cadence with a second check in case Monday's run is missed), `server/plugins/catch-up-sync.ts` runs on every server boot and compares the published snapshot's `generatedAt` against `server/utils/schedule.ts`'s `mostRecentSyncWindow()` (the latest Mon/Thu 10:00 Kyiv slot that has already elapsed, computed via `Intl` so DST is handled without a date library). If the snapshot predates that window, sync runs immediately instead of waiting — this is what makes the schedule survive the server not running continuously (e.g. started Tuesday instead of Monday still catches Monday's window). The existing `server/api/cron/sync-deals.ts` endpoint (bearer-secret protected) is left in place as a manual trigger option.

## Risks / Trade-offs

- **Publitas structure changes silently** → mitigated by the "no empty/partial publish on failure" behavior already required (log and keep last known-good Billa offers, same posture as the other two scrapers).
- **Vision extraction still misreads a price/date on rare pages** → mitigated by the confidence-gating requirement (drop rather than guess) plus `warnings` for non-critical uncertain fields; residual risk accepted as inherent to any OCR/vision-based source and should be monitored via the `warnings` volume once live.
- **Per-run cost of a vision API call per page** → mitigated by change-detection (only extract once per new leaflet, not once per day); still a real recurring cost that should be estimated from actual page counts once the extraction path is implemented, and revisited if it grows unexpectedly.
- **Headless-browser fallback increases cron function size/duration** → only incurred if the lightweight reader-endpoint approach doesn't pan out; flagged explicitly as a task-level risk to re-evaluate rather than deployed silently.
- **Third-party ToS considerations** for fetching Publitas-hosted assets → follow the same posture as the existing scrapers (respect `robots.txt`, no anti-bot bypass, no auth circumvention).

## Migration Plan

Purely additive: new retailer value, new scraper module, new wiring into existing sync/cron/snapshot plumbing. No existing offers, schema fields, or consumer-facing contracts change shape (aside from `Retailer` gaining a new possible value and `DealsSnapshot.sources` gaining a new key, both additive). Rollback is deleting/disabling the Billa entry in the cron wiring; Kaufland and Lidl ingestion are unaffected either way.

## Open Questions

- Exact Publitas reader endpoint/manifest shape — to be determined during implementation (task-level spike); does not change the spec-level contract (page images fetched successfully or the run degrades gracefully) or the chosen extraction approach.
- Concrete confidence threshold for gating (e.g. a numeric cutoff vs. a qualitative signal from the vision model) — to be tuned during implementation against real leaflet pages; the spec only requires that gating exists and behaves conservatively, not a specific number.
