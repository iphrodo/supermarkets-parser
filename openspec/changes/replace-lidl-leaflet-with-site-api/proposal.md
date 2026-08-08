## Why

Lidl offers have no product images, and the change that gave Billa its images could not give Lidl any. `add-leaflet-product-image-crops` recorded three separate reasons: the leaflet source failed its verification run on a pre-existing `Ambiguous weekly leaflet: found 2 candidates` error, Lidl's page-image variants are HMAC-signed so the 188 KB display variant cannot be shrunk, and the XLSX price list contains no images by design. All three are consequences of reading Lidl's offers off pictures of a leaflet.

Lidl Bulgaria publishes those same offers as structured JSON. The original recon (`HANDOFF_parcer.md` §2.2) concluded that lidl.bg is JS-rendered and therefore unscrapable, and on that basis §4.2 struck the search for an internal Schwarz retcat API off the plan as unnecessary. That conclusion was premature. The endpoint the site's own storefront calls is public, unauthenticated, and needs no browser:

```
GET https://www.lidl.bg/q/api/search?assortment=BG&locale=bg_BG&version=v2.0.0&fetchsize=108&offset=0
```

Measured across the whole catalogue on 2026-08-08 — 639 unique products, six requests: every product carries a product photograph (~9 KB webp, served with `Access-Control-Allow-Origin: *`), 567 carry a price in EUR and BGN, 567 carry packaging text, 370 carry a discount, and **all 639 carry `validFrom`/`validUntil` as Unix timestamps** rather than as prose to be parsed. Filtered to food and drink, currently within their validity window, and discounted: **211 offers, all 211 with a photograph, a price, and a unit text.**

For comparison, the XLSX export currently holds 23 discounted product codes, and the leaflet source is failing outright. `robots.txt` disallows `/q/search?id=*`, not `/q/api/search`.

## What Changes

- A new Lidl source reads offers directly from lidl.bg's product search API — no vision model, no page images, no bounding boxes, no leaflet-slug change detection. Six HTTP requests per sync replace ~20 image downloads and ~20 Gemini vision calls.
- Lidl offers gain `imageUrl` — a direct product photograph on a neutral background, the same form Kaufland already uses — rather than `imageCrop`. No new UI: `ProductThumb` already renders this case.
- Lidl offers gain a real `sourceUrl` pointing at the product's own page on lidl.bg, which neither existing Lidl source nor Kaufland can provide.
- Validity windows come from structured timestamps instead of leaflet metadata, and the ingestion admits only offers whose window contains the run time. Next week's offers (306 of the 639) are visible in the feed but deliberately not published.
- **BREAKING**: the `lidl-leaflet` source is removed entirely — scraper, tests, fixtures, its KV change-detection key, and its snapshot page registry. The `DealsSnapshot.sources.lidlLeaflet` key is replaced by `lidlSite`.
- The XLSX price-list source is unchanged. It remains the official ЗУПА baseline and covers staple products that never appear in a promotion.
- Non-food categories (fashion, DIY, garden, toys — 239 of 639) are not ingested: they have no cross-retailer equivalent to compare against.

Lidl's product identifiers (`ians`, 3–7 digits) are internal article numbers, not EAN-13 barcodes. They are not published as `ean`.

## Capabilities

### New Capabilities

- `lidl-site-offer-ingestion`: reading Lidl Bulgaria's promotional offers from the site's public product search API — pagination, filtering to live food offers, direct product image URLs, structured validity windows, and provenance.

### Modified Capabilities

- `deal-catalog`: Lidl offers now carry `imageUrl` rather than `imageCrop`, so the rule that image form is a property of the source needs its Lidl scenario restated; the snapshot's source-status keys change.
- `deals-snapshot-cache`: the per-source failure isolation set changes membership — `lidlLeaflet` leaves it and `lidlSite` joins, and a snapshot written before this change must still be readable for carry-forward.

### Removed Capabilities

- `lidl-leaflet-offer-ingestion`: superseded in full. Every requirement it states — locating the weekly leaflet, fetching page images, vision extraction with confidence gating, validity from leaflet metadata, slug-based change detection — describes work the site API makes unnecessary.

## Impact

- `server/utils/scrapers/lidl-site.ts` (new): pagination, filtering, and mapping to `Offer`, split into a pure parse function and a thin network wrapper so tests run off a fixture.
- `server/utils/scrapers/lidl-leaflet.ts` and its test: deleted. `test/fixtures/lidl-broshura-listing.html`, `lidl-flyer-weekly.json`, `lidl-flyer-campaign.json`: deleted.
- `server/utils/scrapers/vision-extraction.ts`: retained — Billa still uses it.
- `shared/types/offer.ts`: `DealsSnapshot.sources.lidlLeaflet` → `lidlSite`.
- `server/utils/sync.ts`: the `lidlLeaflet` source config is replaced by a `lidlSite` config with no `pageIdPrefix`; `RunSyncDeps.fetchLidlLeafletOffers` → `fetchLidlSiteOffers`, updated at all three call sites (`server/api/cron/sync-deals.ts`, `server/plugins/catch-up-sync.ts`, `server/api/deals.get.ts`).
- `server/utils/kv.ts`: `LIDL_LEAFLET_SLUG_KEY` and its reader/writer removed.
- UI: no component changes expected — `ProductThumb.vue` already handles `imageUrl`, and retailer filters key off `retailer`, not source.
- Operational: the `lidl-leaflet:last-slug` key should be deleted from Upstash after deploy. The previously published snapshot's Lidl leaflet pages are pruned automatically once no offer references them.
- Unblocks `add-leaflet-product-image-crops` for archival: its finding "Lidl leaflet ingestion is currently broken for an unrelated reason" is resolved by removing the source rather than repairing it.
