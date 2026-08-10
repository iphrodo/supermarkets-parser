## Context

Kaufland, Lidl, and Lidl-site ingestion all parse structured data reachable with plain `ofetch` calls; Billa is the outlier requiring OCR/vision. Investigation of `bulmag.org`/`api.bulmag.org` (live `curl` research, `Origin`/`Referer` headers required, no auth needed for anonymous browsing) found BulMag closer to the Kaufland/Lidl-site shape than to Billa:

- `GET https://api.bulmag.org/api/main/products?isPromo=1&productTagIds=1973&page=N&itemsPerPage=100` — paginated JSON listing of promotional products. Item shape: `id, price, priceBgn, promoPrice, promoPriceBgn, discount, brand, name, slug, productTypeName, productTypeSlug, measure, imageThumbnail, isPromo, noQuantity, specialTags`. `isPromo=1` alone returns BulMag's entire always-on discount catalog (1719 items observed); tag `1973` (`"АКЦИЯ-БРОШУРА"`) narrows this to the weekly-brochure subset (~300 items per BulMag's own marketing copy) — the scope this catalog wants, matching the weekly-leaflet cadence of every other source.
- `GET https://api.bulmag.org/api/main/products/{slug}` — per-product detail endpoint. Only place `promotionFrom`/`promotionTo` (format `DD.MM.YYYY`) and `productTags` appear; the list endpoint does not carry either.
- No EAN/barcode anywhere in the API — only internal `number`/`id` codes, which are BulMag-specific and would falsely assert cross-retailer identity if used as `ean` (the same reasoning `lidl-site.ts` already applies to its own internal codes).
- `bulmag.org/robots.txt` disallows query strings on the main site; `api.bulmag.org/robots.txt` is fully open. Calling the API host directly (not `bulmag.org?query=...`) is compliant.
- Mid-investigation, `/api/main/products` and `/api/main/products/{slug}` intermittently returned 403 "API access only" despite correct headers and `X-RateLimit-Remaining` showing plenty of quota — not confirmed safe under sustained load, and not fully explained (looked like a stricter, separate limit on the heavier endpoints rather than the general rate limit).

## Goals / Non-Goals

**Goals:**
- Ingest BulMag's current weekly brochure offers using only the public JSON API, at a request volume in the same order of magnitude as the other sources.
- Never fabricate data the API doesn't provide (validity dates, EAN, unit quantity) — publish honestly incomplete offers (with warnings) or fail the run, never guess.
- Tolerate the API's observed intermittent 403s without treating a single transient failure as fatal.

**Non-Goals:**
- Falling back to BulMag's full always-on discount catalog if brochure-tag filtering turns out not to work server-side — that's a scope change big enough to need a human decision, not a silent fallback (see Open Questions).
- Resolving whether BulMag pricing varies by store/region — defaulted to national scope pending verification, same posture already accepted for Kaufland.
- Reproducing BulMag's own product catalog/SKU IDs as a cross-retailer identifier — `productKey` is derived the same way as the other EAN-less sources (name + unit text, normalized).

## Decisions

### Scope: brochure-tagged subset only, via server-side tag filtering
Fetch `products?isPromo=1&productTagIds=1973&page=N&itemsPerPage=100`, relying on `productTagIds` to filter server-side. This needs a one-time confirmation early in implementation (compare `totalItems` for `isPromo=1&productTagIds=1973` vs. `isPromo=1` alone — expect roughly 300 vs. 1719).

**Alternative considered:** fetch the full `isPromo=1` catalog (1719 items) and filter client-side by calling the detail endpoint for every item to read its `productTags`. Rejected — multiplies request volume by ~6x for a filter the list endpoint should already support, and multiplies downstream LLM product-type-classification cost by roughly the same factor for offers outside the intended weekly-leaflet scope.

**Alternative considered:** fetch the full `isPromo=1` catalog and treat it as the answer (no brochure-only scoping). Rejected per explicit user decision — this is BulMag's permanent "everyday low price" catalog, not a weekly leaflet, and doesn't match what the other four sources represent.

### Validity window: sample-and-verify, not fetch-all-details
The list endpoint never carries `promotionFrom`/`promotionTo`. Rather than calling the detail endpoint for all ~300 items, sample a handful (e.g. one per list page, ~3-5 total), and apply the sampled window to every listed item only if the sample agrees. This assumes BulMag runs one uniform national weekly campaign window — confirmed on a single sampled product during investigation (`10.08.2026`–`16.08.2026`), not yet confirmed across multiple products.

**Alternative considered:** call the detail endpoint for every listed item to get an exact per-item window. Rejected as the default — roughly 300 additional requests per run is disproportionate to the value (a per-item date range) when a national uniform window is the expected case; kept as the documented fallback if sampling ever reveals disagreement (see Open Questions — this fallback is not implemented by default, since 300 requests/run would itself need a human decision about acceptable request volume).

### Unit text: name-embedded quantity, safe per-piece default, or explicit omission
No API field maps cleanly to the existing `unitText` convention (`"<number> <unit>"`, parsed by `server/utils/quantity.ts`'s `UNIT_TOKENS`). Resolve in this order: (1) a quantity embedded in the product name (e.g. `"...600гр"`), extracted via a BulMag-specific regex; (2) `measure === 'БР'` (piece-sold) with no size in the name → default to a single-piece quantity, since that's actually implied by the sale unit, not guessed; (3) anything else (loose-weight items with `noQuantity: true`, e.g. potatoes sold per kg with no fixed pack size) → omit `unitText` and attach a warning rather than assume a per-kg price is intended, since `comparison.ts` already treats an unparseable `unitText` as "exclude from unit-price comparison," not a crash or corruption — the safe default already exists in the codebase, no new handling required.

### Retry/backoff: new pattern for this codebase
No existing scraper needs retry logic (each makes ~1-2 requests/run). BulMag's list pagination + date-window sampling is the first multi-request-per-run source, and the observed intermittent 403s make retry logic necessary rather than optional. Add a small local retry helper (bounded attempts, exponential-ish backoff, retry only on 403/429/5xx) plus a small fixed delay between successive requests. This is scoped to `bulmag.ts` only — not generalized into a shared utility yet, since no other source needs it.

### Wiring
- `shared/types/offer.ts`: add `'bulmag'` to `Retailer`; add a `bulmag` entry to `DealsSnapshot.sources`.
- `server/utils/scrapers/bulmag.ts`: exports `fetchBulmagOffers()` (list pagination + date-window probing + retry/backoff) and a separately-testable parse/normalize function, mirroring the `fetchXOffers()` / `parseXYyy()` split used by every other scraper, so unit tests can feed fixture JSON without hitting the network.
- `server/utils/sync.ts`, `server/api/cron/sync-deals.ts`, `server/plugins/catch-up-sync.ts`: add `fetchBulmagOffers` alongside the existing four, following the same partial-failure isolation already specified in `deals-snapshot-cache`. No `belongsToSource` ambiguity to resolve (unlike Lidl's two same-retailer sources) — BulMag is the only source producing `retailer: 'bulmag'`.
- Frontend: unlike the fully retailer-agnostic comparison rendering, four frontend files hardcode a retailer list/label map (`app/utils/format.ts`'s `RETAILER_LABELS`, `app/composables/useComparisonFilters.ts`, `app/components/comparison/ComparisonToolbar.vue`, `app/components/DealsFilterBar.vue`) and need a `bulmag` entry added by hand. `RETAILER_LABELS` is `Record<Retailer, string>`-typed, so TypeScript forces that one; the other three are plain arrays/templates and are easy to silently miss — called out explicitly in tasks.md so they aren't.

## Risks / Trade-offs

- **`productTagIds` doesn't actually filter server-side** → mitigated by verifying this first, before writing the pagination loop; if it fails, the run fails closed per the `bulmag-offer-ingestion` spec rather than silently ingesting the full always-on catalog. Residual risk: this is a real possibility, not a formality — confirm before relying on it.
- **Sampled items disagree on validity window** → mitigated by the spec's explicit "fail rather than guess" requirement; the 300-request fallback described above is a known-possible follow-up, not something this change implements silently.
- **Intermittent 403s recur under real sync-run load** → mitigated by retry/backoff and inter-request pacing, but not proven solved by investigation alone (rate-limit headers showed quota remaining when the 403s occurred, so the root cause isn't fully understood). Needs a manual multi-run verification pass before being trusted unattended, same posture as Billa's OCR-confidence tuning needed human review.
- **BulMag pricing turns out to vary by store/region** → the `inventory` field on the detail endpoint suggests per-store *stock*, not necessarily per-store *price*, but this wasn't directly confirmed. If it does vary, `scope: 'national'` would be wrong and would need to become `'regional'` with a populated `store` reference — a materially bigger change than currently scoped. Flagged rather than assumed.
- **The real BulMag product page URL pattern for `sourceUrl` is unconfirmed** → low-impact (a broken deep link, not a data-correctness issue); confirm during implementation, fall back to the brochure page URL if the exact route can't be established cheaply.

## Migration Plan

Purely additive: new retailer value, new scraper module, new wiring into existing sync/cron/snapshot plumbing, four small frontend list/label additions. No existing offers, schema fields, or consumer-facing contracts change shape. Rollback is deleting/disabling the BulMag entry in the cron wiring; the other four sources are unaffected either way.

## Open Questions

- Whether `productTagIds=1973` genuinely filters server-side — resolved by a one-time verification call at the start of implementation; if it doesn't, the fallback (full-catalog ingestion or 300-request per-item tag checks) is a scope change that needs a human decision, not a default this change makes for itself.
- Whether all brochure items truly share one validity window — only confirmed on a single sampled product during investigation; the sampling approach in "Decisions" above is designed to detect disagreement and fail rather than assume, but the underlying assumption itself remains open until verified against a full week's data.
- Whether BulMag pricing varies by store/region — assumed national by default (mirroring Kaufland's unverified-national precedent), to be confirmed opportunistically rather than blocking this change.
- Exact BulMag product page URL pattern for `sourceUrl` — to be confirmed during implementation; does not affect the chosen approach or the spec-level contract.

None of these affect the specs, the chosen approach, or the task breakdown — they narrow implementation-time verification steps already called out in tasks.md, not decisions still to be made about what the system should do.
