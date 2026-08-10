## Why

The `/deals` offer listing stacks each card's image above its text in a tall vertical block (retailer badge, full-width square photo, then eight more stacked text blocks), so only a couple of offers fit on screen at once. The home page's price-comparison view already solves this with a compact horizontal card (image left, text right), and the user wants the same density on `/deals` without dropping any of the information currently shown.

## What Changes

- Rework `OfferCard.vue` from a vertical stack to a horizontal row layout (fixed-size image on the left, all existing fields stacked tightly on the right), following the pattern already used by `PriceComparisonCard.vue` on the home page.
- Tighten the card's padding and internal spacing (`p-4`→`p-3`, `gap-2`→`gap-1`) and drop the separate bordered footer block for the category/source-link row, folding it into a plain compact row instead.
- No field is removed: retailer, discount %, image, brand, name, unit text, price (EUR + BGN), original price, loyalty/mechanic badges, purchase limit, valid-until date, category, and source link all remain visible on the card.
- No change to the `/deals` grid container (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) — the shorter card height alone significantly increases how many offers are visible per screen.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deals-browsing-ui`: adds a requirement that the full offer listing's cards use a compact, horizontal (image-beside-text) layout rather than a tall vertical stack, while continuing to satisfy every existing per-card content requirement (image, source attribution, end date, etc.).

## Impact

- `app/components/OfferCard.vue` — layout rework (horizontal row instead of vertical stack).
- `app/pages/deals.vue` — no functional change; grid container classes stay as-is.
- No API, data model, or snapshot changes. Purely a presentational change to the full offer listing; the comparison landing view (`PriceComparisonCard.vue`) is unaffected and serves as the visual reference.
