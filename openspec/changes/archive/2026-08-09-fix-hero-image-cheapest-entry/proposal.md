## Why

A comparison card states one offer in words — the cheapest entry's retailer, per-unit price, pack price and pack size — and shows one image beside it. Readers take the image as a picture of that offer. Today it often is not.

The shipped resolution order puts *any* entry's direct photograph above the *cheapest* entry's leaflet crop. Since Billa publishes only crops while Kaufland and the Lidl product listing publish image URLs, every group in which Billa is cheapest and either of the others participates shows a competitor's packshot next to Billa's price. Reported instances: "кашу" priced at Billa 6.80 €/кг beside the Kaufland Rois bag, "бадеми" priced at Billa 7.65 €/кг beside the Lidl Alesto pack, "кайма" priced at Billa beside the Kaufland Народен pack. The card is not merely showing a generic stand-in — it is showing a specific, differently-branded, more expensive product as though it were the one on offer.

The trade was made deliberately (`redesign-comparison-landing` design.md called it "the intended trade of a clean product photograph against showing the cheapest retailer's own artwork"), so the picture quality it buys is real. It is being revisited because the cost turned out to be a factual mismatch on the page's single most important claim, not just a duller thumbnail.

## What Changes

- The hero image of a comparison card resolves to the cheapest entry's own imagery first, in either form — direct image URL, then resolvable leaflet crop — before any other entry is considered.
- Only when the cheapest entry carries no usable imagery does the resolution fall back to the other entries, and there the existing preference for a photograph over a crop is kept.
- The placeholder tile remains the last step, unchanged.

Net effect on the reported cases: the Billa crop is shown next to the Billa price. Groups whose cheapest entry has no imagery at all (a Lidl price-list offer) still borrow another retailer's picture, which stays a deliberate choice — the group is one product type, and a same-type photograph is more informative than an empty tile.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `deals-browsing-ui`: the "Comparison carries a product image" scenario changes which offer the group's image is taken from — the cheapest entry's imagery outranks another entry's photograph, instead of the reverse.

## Impact

- `app/utils/hero-image.ts`: the four-step candidate order becomes cheapest-first; the doc comment stating the current rationale is rewritten rather than left contradicting the code.
- `app/utils/__tests__/hero-image.test.ts`: the case "prefers a photograph over a crop even when the crop is the cheapest entry's" asserts exactly the behavior being removed and inverts.
- No change to `PriceComparisonCard.vue`, `ProductThumb.vue`, the details view, the snapshot schema, or any scraper — the resolution function is the only thing that moves.
