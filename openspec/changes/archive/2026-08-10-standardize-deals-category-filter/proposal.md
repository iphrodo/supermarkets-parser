## Why

The `/deals` page's category filter is built from each retailer's raw, uncoordinated `Offer.category` value. Kaufland and BulMag scrape their own free-text category names, Billa's is a Gemini-generated free-text guess, and Lidl's XLSX/"ЗУПА" feed carries a bare numeric code with no code-to-name table anywhere in the codebase. The result is a filter dropdown mixing unexplained numbers (12, 27, 37, 46, 5...) with inconsistent Bulgarian text across stores, which is confusing to use. A closed, Bulgarian-labeled department taxonomy (`DepartmentId`) already exists and is already computed for every offer during each sync via the existing product-type classification pipeline — it just never reaches unmatched offers or the `/deals` page today. This change wires that existing computation through instead of inventing a second taxonomy or a Lidl-code lookup table.

## What Changes

- Add `department?: DepartmentId` to `Offer`, populated for every offer during snapshot publication by resolving `productKey` through the same classification vocabulary/assignments already computed each sync (previously this resolution was inlined and private to comparison-group building, and only reached offers matched across 2+ retailers).
- Extract the existing inline `productKey`/`typeId` → department join (currently private inside `buildComparisons`) into a reusable resolver, used both for comparison groups and for the new per-offer annotation.
- On sync failure, offer departments degrade per-offerKey from the previous published snapshot (mirroring the existing degrade-to-previous behavior for comparison groups), defaulting an offer with no prior match to the catch-all department rather than leaving it unset.
- Replace the `/deals` page's category filter: the dropdown now lists the fixed `DepartmentId` set (in canonical department order) instead of the distinct raw `category` strings, and filtering compares an offer's resolved department instead of its raw category text.
- The raw `Offer.category` field and its display on the offer card are unchanged — this only changes the filter/taxonomy used for narrowing, not the free-text detail already shown per offer.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deal-catalog`: every published offer now carries a resolved `department`, defaulting safely when unresolved or absent on a cached pre-change snapshot.
- `deals-browsing-ui`: the full offer listing's category filter narrows by the fixed department taxonomy instead of by raw per-retailer category values.

## Impact

- `shared/types/offer.ts` — new optional `Offer.department` field.
- `server/utils/comparison.ts` — new exported department resolver, reused by `buildComparisons`.
- `server/utils/sync.ts` — snapshot publication annotates every offer with a resolved department, with a degrade-on-failure path.
- `app/components/DealsFilterBar.vue`, `app/pages/deals.vue` — category filter now driven by `DepartmentId`/`DEPARTMENT_LABELS_BG`/`DEPARTMENT_ORDER`.
- No change to any scraper, to `Offer.category`, or to `OfferCard.vue`'s category badge.
