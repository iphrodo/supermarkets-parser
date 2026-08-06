## 1. PriceComparisonCard source link

- [x] 1.1 In `app/components/PriceComparisonCard.vue`, add a link to `row.offer.sourceUrl` for every row in the `rows` list (not only `row.entry.isCheapest`), opening in a new tab (`target="_blank" rel="noopener"`), styled consistently with the "Source" link in `OfferCard.vue:115`.

## 2. PriceComparisonCard EAN display

- [x] 2.1 In the same component, render `row.offer.ean` next to the product name/unit text only when it is non-null; render nothing (no empty span, no stray separator) when `ean` is `null`.

## 3. Verification

- [x] 3.1 Run the app locally, open the landing page, and confirm every retailer row in a comparison group has a working source link that opens in a new tab.
- [x] 3.2 Confirm EAN is shown for Kaufland offers and absent (cleanly, no leftover punctuation) for Lidl/Billa offers.
- [x] 3.3 Check dark mode styling of the new link/EAN text matches the rest of the card.
