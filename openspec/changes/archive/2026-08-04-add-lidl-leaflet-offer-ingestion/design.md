## Context

See `proposal.md` for motivation. Relevant current state:

- `server/utils/scrapers/billa.ts` implements the leaflet+Gemini-vision pattern being replicated: fetch a promo page → discover the current publication → fetch page image refs → fetch page images (per-page failure isolation) → run Gemini vision per page with bounded concurrency → confidence-gate extracted items → map to `Offer[]`.
- `server/utils/scrapers/lidl.ts` implements the existing Lidl XLSX price-list source, unaffected in behavior by this change except for gaining an exported source-identity predicate.
- `server/utils/sync.ts`'s `runDailySync` orchestrates all sources, isolates per-source failures via a previous-snapshot fallback filtered by `offer.retailer`, and writes the merged `DealsSnapshot`.
- `shared/types/offer.ts` defines `Retailer = 'kaufland' | 'lidl' | 'billa'` and `Offer.retailer`/`Offer.sourceUrl`.
- Investigation (via live HTTP requests during planning, not guesswork) confirmed Lidl Bulgaria's weekly leaflet is served by a Schwarz-Gruppe-wide "leaflets" platform, not Publitas:
  - Listing page (plain server-rendered HTML): `GET https://www.lidl.bg/c/broshura/s10020060`, containing `<a class="flyer" href="https://www.lidl.bg/l/bg/broshura/<slug>/ar/0">` links — one per currently published leaflet/campaign.
  - Flyer metadata + pages API (JSON, unauthenticated): `GET https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<slug>` → `{ flyer: { title, startDate, endDate, offerStartDate, offerEndDate, products: [], pages: [{number, zoom, ...}] } }`. `pages[].zoom` is a ready-to-use high-resolution page image URL; `products` is confirmed empty (no structured data), so vision extraction is still required; `offerStartDate`/`offerEndDate` reliably give the promo validity window.
  - The weekly leaflet is reliably distinguished from longer-running campaign leaflets also present on the listing page by its validity window: exactly 7 days (`endDate - startDate === 6`), confirmed against a real weekly leaflet (`2026-08-03` → `2026-08-09`) versus real campaign leaflets spanning 24 and 227 days.

## Goals / Non-Goals

**Goals:**
- Reuse Billa's proven pattern and its mechanical Gemini-vision plumbing rather than reinventing it.
- Keep the new source fully independent of the existing Lidl XLSX source — either can fail or be removed without affecting the other.
- Fix the latent design gap this change exposes: two sources sharing one `retailer` value breaks the current `offer.retailer === X` fallback-filter assumption in `runDailySync`.

**Non-Goals:**
- Reconciling or deduplicating overlapping products between the XLSX and leaflet sources beyond what the existing `offerKey`-based dedup in `mergeCatalog` already does incidentally.
- Using the flyer API's `pdfUrl`/`hiResPdfUrl` (a full-leaflet PDF) — page-by-page images match Billa's existing pattern and keep per-page failure isolation; PDF-based ingestion is a possible future alternative, not pursued here.
- Changing the `Retailer` union type or introducing a new retailer value for the leaflet source.

## Decisions

**Two sources, one `retailer` value, distinguished by `sourceUrl`.** Introducing a new `Retailer` value (e.g. `'lidl-leaflet'`) would be simpler to filter on, but would split "Lidl" into two user-facing buckets and require touching every place that groups/labels offers by retailer for display. Since the goal is purely "more Lidl products," both sources keep `retailer: 'lidl'`; `Offer.sourceUrl` already differs cleanly between them (the `.xlsx` export URL vs. the leaflet page URL) and is repurposed as the internal source-identity signal.

**Generalize `runDailySync`'s fallback filter to a per-source predicate instead of a hardcoded `retailer` check.** The current code does `previous?.offers.filter(o => o.retailer === 'lidl')` per source. With two `retailer: 'lidl'` sources, that filter can't tell them apart: a failure in one would incorrectly pull the other, still-succeeding source's stale previous offers into the merge alongside its fresh ones. Alternatives considered: (a) leave the filter as-is and rely on `mergeCatalog`'s offerKey-based dedup to paper over duplicates — rejected, since it silently depends on incidental key collisions and can resurrect stale entries under keys that don't collide with anything fresh; (b) add a dedicated `source` field to `Offer` — rejected as unnecessary schema growth when `sourceUrl` already uniquely identifies each source's offers. Each source module exports its own `belongsToSource`-style predicate (`isLidlXlsxOffer`, `isLidlLeafletOffer`) so "how do I recognize my own offers" stays colocated with the source that produces them, and the orchestrator drives fallback/health-tracking from a small per-source config list instead of hand-written per-retailer branches.

**Validity dates come from the flyer API, not from vision extraction.** Billa's vision prompt asks the model to read `validFrom`/`validUntil` off the page because Billa exposes no structured validity metadata. Lidl's flyer API already provides `offerStartDate`/`offerEndDate` reliably, so asking the model to also OCR dates would be redundant risk (another confidence-gated field that could drop otherwise-good extractions) for no benefit. The vision prompt/schema for this source omits validity fields entirely; every offer from a given leaflet takes that leaflet's `offerStartDate`/`offerEndDate` uniformly.

**Extract only the source-agnostic Gemini-vision mechanics into a shared module.** The generically reusable pieces (client init/caching, the `generateContent` + JSON-parse call, the bounded-concurrency helper, per-page image fetch with failure isolation) have zero coupling to what fields are being extracted and total a meaningful chunk of duplicated code across two sources. The prompt text, response schema, and confidence-gating shape are genuinely different (Lidl's omits validity fields) and stay in each source module rather than being forced into an artificially generic shape.

**Weekly-leaflet selection by validity-window length, not by title text.** The listing page's link labels are Bulgarian free text and encoding-fragile to match reliably. The 7-day window is a stable structural signal confirmed against real data and matches Lidl's known weekly cadence (leaflet valid Monday–Sunday). The window is measured on `offerStartDate`/`offerEndDate`, not `startDate`/`endDate`: live verification during implementation (2026-08-04) showed the weekly leaflet's `startDate`/`endDate` (its publish/visibility window, e.g. 2026-07-30 → 2026-08-09, 10 days) is longer than its actual promo validity window `offerStartDate`/`offerEndDate` (2026-08-03 → 2026-08-09, 6 days = 7-day span); campaign leaflets' offer-date spans remained multi-week/multi-month either way, so the field swap doesn't affect their exclusion.

## Risks / Trade-offs

- **Schwarz-Gruppe leaflets platform is undocumented and could change.** [Risk] The listing-page markup or the flyer API's shape/route could change without notice, breaking discovery. → Mitigation: same posture as Billa's Publitas dependency — isolate the failure per-source (this source failing doesn't take down Kaufland/XLSX-Lidl/Billa), fall back to last known-good offers, and surface the failure via the `lidlLeaflet` health entry in the snapshot for visibility.
- **Skip-check happens after resolving which candidate is the weekly leaflet, not before any network call.** [Trade-off] Unlike Billa (whose slug is embedded directly in the promo page HTML, so the "has it changed" check is free), determining which of Lidl's listing-page candidates is the weekly one requires a handful of lightweight flyer-metadata JSON calls first. This still skips the expensive part (page image downloads + per-page vision calls) when unchanged, which is what the change-detection requirement is actually protecting against. Accepted as-is; not worth the added complexity of caching candidate resolution separately.
- **Confidence gating can under-report on a genuinely different leaflet layout.** [Risk] Lidl's leaflet visual design differs from Billa's; the shared prompt structure (adapted, not copy-pasted verbatim) may need prompt tuning after real runs. → Mitigation: same confidence-gating and per-page failure isolation as Billa means a bad page or a miscalibrated prompt degrades offer count/quality gracefully rather than corrupting data or failing the run.

## Migration Plan

No data migration. Purely additive: a new source, a new `sources.lidlLeaflet` snapshot field (existing consumers reading the `sources` object need no change, since they don't destructure it exhaustively — verify this assumption while wiring `shared/types/offer.ts`), and a generalized-but-behavior-preserving fallback filter for the three existing sources. Deployable and rollback-able independently of the existing Lidl XLSX source: removing the new fetcher from `RunSyncDeps` wiring reverts to current behavior with no schema cleanup required.
