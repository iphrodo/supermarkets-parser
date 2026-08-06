## Why

The landing page's cross-retailer comparison view lets a user spot the cheapest retailer for a product type, but gives no way to act on it: there is no link to the retailer's page for that offer, and no EAN/article code to identify the exact product at the shelf. The single-offer list already shows a source link (and, where available, would show an EAN), so the comparison view is missing capability the data already supports.

## What Changes

- Each retailer row in a comparison group gets a link to that offer's `sourceUrl`, opening in a new tab, so the user can jump to the retailer's page for that specific offer — not only for the cheapest row, but for every retailer shown in the group.
- Each retailer row shows the offer's EAN code when populated (currently only Kaufland offers carry one; Lidl and Billa offers have `ean: null` until their scrapers are extended, which is out of scope here).
- No change to data collection, scraping, or the comparison-grouping logic — `sourceUrl` and `ean` already exist on every `Offer` and are already available to the comparison card.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deals-browsing-ui`: the "Price comparison is the landing view" requirement's traceability scenario is extended so each comparison entry also exposes a link to its offer's source and, when present, its EAN code — not just product name, pack size, and retailer.

## Impact

- `app/components/PriceComparisonCard.vue`: add per-row source link and conditional EAN display.
- No changes to `shared/types/offer.ts`, `server/utils/comparison.ts`, or any scraper — `Offer.sourceUrl` and `Offer.ean` are already populated fields, just not rendered in this component.
