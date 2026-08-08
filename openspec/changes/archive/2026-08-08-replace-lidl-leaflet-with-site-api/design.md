## Context

See proposal.md — Why. This section records only what was measured against the live endpoint on 2026-08-08, since the whole design rests on it and none of it was previously documented.

**Endpoint.** `GET https://www.lidl.bg/q/api/search` with `assortment=BG&locale=bg_BG&version=v2.0.0&fetchsize=<n>&offset=<n>`. No auth, no cookies, no referer, no browser. A `category.id=<id>` parameter narrows to a facet. The response's own `facets` array publishes the full category tree with counts, and every facet URL is expressed as a call to this same endpoint — this is the storefront's public query interface, not a discovered internal one.

**Response shape.** `{ numFound, offset, fetchsize, maxfetchsize, facets, items[] }`. A product lives at `items[].gridbox.data`; entries without a `gridbox` are non-product results and are skipped. `maxfetchsize` reports 1000, but the server caps actual page size at **108** regardless of what is requested — `fetchsize=1000` still returns 108, and the response echoes `fetchsize: 108`. Verified terminating: offsets 0/108/216/324 over the food facet returned 108+108+108+74 = 398 = `numFound`, no duplicates.

**Fields used**, all present on `gridbox.data`:

| Source field | Used for |
|---|---|
| `fullTitle`, `brand.name` | `name`, `brand` |
| `price.price`, `price.priceSecond` | EUR and BGN, as decimal numbers |
| `price.oldPrice` (0 when absent) | `originalPriceEurCents` |
| `price.discount.percentageDiscount` / `.discountText` | `discountPercentage` |
| `price.packaging.text` (`400 g/опаковка`, `за kg`) | `unitText` |
| `image` | `imageUrl` |
| `stockAvailability.badgeInfoV2[0].validFrom` / `.validUntil` | Unix seconds |
| `keyfacts.wonCategoryPrimary` / `.wonCategoryPrimaryPath` | `category`, food filter |
| `canonicalPath` | `sourceUrl` |
| `erpNumber` | dedupe key |

**Whole-catalogue measurement** (639 unique products, six requests): 639 with an image, 639 with structured validity timestamps, 567 with a price, 567 with packaging text, 370 discounted. After filtering to food/drink, live, and discounted: **211 offers, 211 with image + price + unit text.**

**Legality.** `robots.txt` disallows `/q/search?id=*`; the path used here is `/q/api/search`. Load is six GETs twice a week. No anti-bot circumvention, no session emulation, no aggregator scraping — the boundaries `HANDOFF_parcer.md` §2.3 sets are unchanged and respected.

## Goals / Non-Goals

**Goals:**
- One ingestion path for Lidl promotions that needs no model call and no image download.
- Product photographs for Lidl via the existing `imageUrl` rendering path, with no UI change.
- Delete the leaflet source outright rather than leave it disabled, so the codebase carries one Lidl promo source, not two.

**Non-Goals:**
- Billa. It has no equivalent API; leaflet + vision + crops remain its only route, and every crop-related utility stays in place for it.
- Backfilling images onto Lidl XLSX offers. The two sources' product code namespaces do overlap (both 7-digit zero-padded article numbers; a join matches on 39 codes), but the overlap is 5.6% because they cover different assortments — the XLSX is the permanent staple range, the listing is the promotional range. Not worth a join for 39 products.
- Ingesting next week's offers, non-food ranges, or Lidl Plus coupon prices.
- Any change to comparison, classification, or the browsing UI.

## Decisions

### Fetch unfiltered and filter food client-side, rather than querying `category.id=10068374`

Querying the food facet directly would cut six requests to four (398 matches instead of 639). Rejected: `10068374` is a magic id owned by the retailer's CMS, and if it is ever re-issued the source fails silently by returning a plausible but wrong set. Client-side filtering keys off `keyfacts.wonCategoryPrimaryPath`, whose **second segment is a stable numeric top-level department id** — `17` = Храна и близки до нея храни, `10` = Вино, бира и спиртни напитки — verified to cover 400 of 639 products with zero entries missing the field. That is language-independent, does not depend on matching Cyrillic category names, and degrades to "no offers" rather than "wrong offers".

Two extra HTTP requests per sync is not a cost worth optimising against that.

### Filter on the validity window, not on the "is it live" badge type

The listing exposes both a badge `type` (`IN_STORE_TODAY_DATE_RANGE`, `IN_STORE_FROM_FUTURE_DATE_RANGE`, `IN_STORE_PAST_DATE_RANGE`) and the raw `validFrom`/`validUntil` timestamps. Filtering on the badge type would mean trusting the retailer's own rendering of "today" against its server clock and an undocumented enum. Comparing `validFrom <= now <= validUntil` against injected `now` uses the same numbers the offer's own dates are derived from, is testable without freezing an enum, and keeps one source of truth for the window. Measured agreement between the two approaches on the live catalogue: 333 live by timestamp vs 321 `..._TODAY_...` — the gap is products whose window opened partway through today, which the timestamps handle correctly and the badge does not.

### Discount percentage: structured value first, label second, warning third

Only 107 of 370 discounted products carry `percentageDiscount` together with a struck-through `oldPrice`. The other 263 carry only `discountText` — mostly `"34% по-евтино"` or `"-51%"`, which a `/(\d+)\s*%/` match recovers, but also bare `"Акция"` and `"27% безплатно"` (a quantity promotion, not a price cut). So: prefer `percentageDiscount`; else read a percentage from `discountText`; else publish the offer with `discountPercentage: 0` and a warning naming the unparsed label. Dropping those offers would discard real, correctly-priced promotions over a missing derived number; inventing a percentage from `oldPrice` when `oldPrice` is 0 would be worse.

`oldPrice: 0` means "no previous price published", not "previously free" — it maps to `null`, never to `0`.

### `imageUrl`, used verbatim

The image URLs are `imgproxy-retcat.assets.schwarz/<signature>/…/w:427/h:320/…`. Rewriting the embedded dimensions returns **403** — the size is inside the signed payload. Accepted as-is: the served asset is ~9 KB webp with `Access-Control-Allow-Origin: *` and a one-year `cache-control`, which is an order of magnitude cheaper than the 188 KB signed leaflet page that made Lidl crops unattractive in the first place, and cheaper than Kaufland's ~180 KB JPEGs. There is nothing to optimise here.

Consequently Lidl offers set `imageUrl` and omit `imageCrop` entirely — the `deal-catalog` rule that image form is a property of the source, and its "not merely null" phrasing, is satisfied by constructing the object without the key.

### `ians` is not an EAN

`ians` values are 3–7 digits (`5511000`, `227544`, `7207464`) — Lidl's internal article numbers, the same namespace as the XLSX `Код на продукта` column. `computeProductKey` treats a non-null `ean` as a **cross-retailer** identity (`ean:<value>`), so publishing an article number there would let an arbitrary 7-digit Lidl code collide with a Kaufland EAN-13 prefix and merge two unrelated products into one comparison group. `ean` stays `null`; identity falls back to the retailer-scoped name+unit hash, as it already does for Lidl and Billa.

### Rename the source key rather than reuse `lidlLeaflet`

`DealsSnapshot.sources.lidlLeaflet` → `lidlSite`. Reusing the old key would leave a name that describes nothing in the code and would silently carry the old source's stale offers forward through `belongsToSource` on the first run. Renaming makes the previously published snapshot's Lidl leaflet offers unclaimed by any source, so they are simply not carried forward, and `pruneUnreferencedPages` then drops their pages on the same run — the migration happens by construction rather than by a cleanup step.

The one thing this needs: reading a snapshot that predates the rename must not throw on the missing `lidlSite` key. Treat an absent per-source status as `{ scrapedAt: null, ok: false }`.

### Structure the scraper as pure parse + thin fetch, like `lidl.ts`

`parseLidlSiteResponse(pages, now)` takes already-fetched page payloads and an injected clock; `fetchLidlSiteOffers()` does pagination and calls it. This is the shape [`lidl.ts`](../../../server/utils/scrapers/lidl.ts) already uses (`parseLidlWorkbook` / `fetchLidlOffers`) and it is what makes the time-window and category filters testable off a fixture without a clock freeze or a network mock.

## Risks / Trade-offs

- **The endpoint is undocumented and can change shape without notice.** → It is the storefront's own query interface, so it breaks only when lidl.bg's product search breaks. The parse fails loudly rather than emitting partial data, and `runDailySync`'s per-source isolation carries forward the last known-good Lidl offers. The XLSX source is untouched and independent, so Lidl never goes dark entirely.
- **Deleting the leaflet source is irreversible in this change.** → It is currently failing in production and contributes nothing; the code remains in git history. If lidl.bg's API is withdrawn, restoring the leaflet source is a revert, not a rewrite — but it would also need the `Ambiguous weekly leaflet` bug fixed first, which was never done.
- **108-per-page cap is unstated and could change.** → Advance the offset by the number of items actually returned, never by the number requested, and stop at `numFound` or after a bounded page count. A cap change then costs more requests, not missing products.
- **263 of 370 discounts have no structured percentage.** → Regex fallback plus a warning. `discountPercentage: 0` on a genuinely discounted offer will sort oddly under a "biggest savings" filter; `redesign-comparison-landing`'s min-savings filter should be aware that 0 can mean "unquantified" rather than "no discount". Flagged, not solved here.
- **Category ids `17`/`10` are still upstream-owned values.** → Less volatile than a CMS page id, and a change surfaces as an offer count collapsing to near zero rather than as wrong data. Worth logging the post-filter count so a collapse is visible in the sync output.
- **`price.price` is a float.** → Converted with `Math.round(value * 100)` immediately at the boundary, consistent with `toCents` in `lidl.ts`. No float ever reaches an `Offer`.

## Migration Plan

1. Merge and deploy. No schema migration is needed for the published snapshot: `sources.lidlSite` appears on the first sync after deploy, and the tolerant read handles the interim.
2. First sync after deploy drops the old Lidl leaflet offers (unclaimed by any source) and prunes their pages automatically.
3. Delete the `lidl-leaflet:last-slug` key from Upstash. Not load-bearing — nothing reads it once `lidl-leaflet.ts` is gone — but it is dead data.
4. Rollback: revert the commit. The previously published snapshot is untouched by a failed deploy, and the old leaflet source returns in its previously-failing state.
