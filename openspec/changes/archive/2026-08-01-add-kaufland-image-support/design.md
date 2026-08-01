## Context

`server/utils/scrapers/kaufland.ts` parses an SSR JSON payload from Kaufland's offers page. Each raw tile (`KauflandRawOffer`) already carries `listImage?: string`, a CDN URL of the form `https://kaufland.media.schwarz/is/image/schwarz/8606018614950_BG_P`. Today `deriveEan()` regex-matches a barcode segment out of that URL, and the URL itself is dropped once `mapOffer()` builds the final `Offer`. Lidl's source (`ExportSecondList.xlsx`) has no image column at all — see proposal.md.

## Goals / Non-Goals

**Goals:**
- Persist the already-fetched Kaufland image URL onto the `Offer` record with no new network requests.
- Keep EAN extraction and image URL population independent, so a future change to one doesn't silently affect the other.

**Non-Goals:**
- Rendering images in the deals UI (follow-up change).
- Adding image support for Lidl (no source data available; would require a different scrape target entirely).
- Validating, proxying, caching, or rewriting the CDN URL (per prior design note, treated as source-provided and potentially short-lived, same as today's EAN-derivation use).

## Decisions

- **Add `imageUrl: string | null` directly to the shared `Offer` type** (`shared/types/offer.ts`) rather than a separate side-table or Kaufland-only type, so the field follows the existing pattern used for `productUrl` (present only where the source structurally supports it — absent, not null, for Lidl). Alternative considered: a Kaufland-specific extended type; rejected because the catalog already merges both sources into one `Offer[]` and per-source subtypes would force consumers to narrow by retailer.
- **Populate `imageUrl` unconditionally from `raw.listImage ?? null` in `mapOffer()`**, decoupled from whether `deriveEan()` finds a barcode. Alternative considered: only set `imageUrl` when EAN extraction also succeeds; rejected since a missing/malformed barcode segment doesn't mean the image itself is invalid — the two are unrelated concerns that currently happen to share one source field.

## Risks / Trade-offs

- [Risk] Kaufland's CDN URL format could change without notice, silently breaking images. → No mitigation needed for this change since it's read-through, not stored/cached; a broken URL just renders a broken `<img>` client-side, same exposure as the existing EAN-regex has today.
- [Risk] Existing tests asserting the full `Offer` shape from Kaufland fixtures will need an `imageUrl` expectation added, or they'll fail on the new field. → Covered in tasks.md.
