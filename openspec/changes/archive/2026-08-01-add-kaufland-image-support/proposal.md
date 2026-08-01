## Why

The Kaufland scraper already receives a product image URL (`listImage`) in the SSR payload for every offer, but today it is only used as a scratch value to derive `ean` via regex and is then discarded (`server/utils/scrapers/kaufland.ts`). Persisting this URL lets the deals UI show product images at zero extra scraping cost, since no new request or source is needed.

## What Changes

- Add a nullable `imageUrl` field to the shared `Offer` schema (`shared/types/offer.ts`).
- Populate `imageUrl` from `KauflandRawOffer.listImage` in `mapOffer()` (`server/utils/scrapers/kaufland.ts`), independent of whether an EAN could be derived from it.
- Lidl offers will structurally have no `imageUrl` (field absent, not merely null), matching the existing pattern used for Kaufland's absent `productUrl` — the ЗУПА XLSX export Lidl scrapes from has no image data.
- No UI changes are in scope for this change; rendering `imageUrl` in the deals browsing UI is a follow-up.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `kaufland-offer-ingestion`: add a requirement to populate `imageUrl` on every parsed offer from the tile's image URL, decoupled from EAN extraction.
- `deal-catalog`: extend the normalized offer schema with a nullable `imageUrl` field, present only where the source structurally provides one (Kaufland), absent (not null) for sources that don't (Lidl).

## Impact

- `shared/types/offer.ts` — `Offer` interface gains `imageUrl: string | null`.
- `server/utils/scrapers/kaufland.ts` — `mapOffer()` sets `imageUrl` from `raw.listImage`.
- `server/utils/scrapers/lidl.ts` — unaffected; no `imageUrl` field emitted.
- Test fixtures/tests referencing full `Offer` shape (e.g. Kaufland scraper tests) may need updating to include `imageUrl`.
- No new external requests, dependencies, or network calls.
