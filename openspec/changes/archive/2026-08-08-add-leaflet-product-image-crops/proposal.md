## Why

Only Kaufland offers carry a product image. `imageUrl` is populated exclusively by the Kaufland scraper (from `raw.listImage`), so Lidl and Billa offers render as text-only. On the comparison landing page — where a group is a canonical product type and each row is a different retailer's SKU — this means most cards show no picture at all, and a user cannot tell at a glance what is actually being compared.

The two leaflet sources (Billa, Lidl leaflet) already download every leaflet page image and send it to a Gemini vision call to extract names and prices, then throw the image away. The product photographs are right there in those page images; the pipeline just never records where they are.

## What Changes

- The existing per-page vision call additionally returns a bounding box for each product's photograph on the page. No new request, no new model, no new service — the box is extra fields on the structured-output schema of a call that already happens.
- Extracted boxes are validated geometrically and for mutual overlap, and a box that fails validation is discarded **while the offer itself is kept**. A missing image is acceptable; a wrong image is not.
- Offers from leaflet sources gain an `imageCrop` field: a reference to a leaflet page plus a normalized box. The page images themselves are recorded once per page in a new snapshot-level `leafletPages` registry, so ~1000 leaflet offers do not each carry a duplicate ~200-character URL.
- A shared `ProductThumb` component renders three cases from one interface: a direct image URL (Kaufland), a CSS-cropped region of a leaflet page image (Billa, Lidl leaflet), or a category placeholder tile. It never leaves an empty gap and never shows a broken-image icon.
- The client is served a **smaller** page-image variant than the one used for extraction (Publitas `at800` instead of `at1600`; Lidl `image` instead of `zoom`), since crop quality needs far less resolution than OCR does.

The leaflet page image hosts serve cross-origin requests without `Access-Control-Allow-Origin`, so a canvas-based crop would taint the canvas. Cropping is therefore done in CSS, which needs no CORS grant and no server-side image processing.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `deal-catalog`: the normalized offer schema gains an optional `imageCrop` field for leaflet-derived offers, and the published snapshot gains a leaflet-page registry that offers reference by id rather than duplicating.
- `billa-offer-ingestion`: the vision extraction step additionally yields a per-product bounding box, gated by its own confidence flag and by geometric and overlap validation; page fetching distinguishes the resolution used for extraction from the smaller variant recorded for display.
- `lidl-leaflet-offer-ingestion`: the same two changes, in parallel with Billa.
- `deals-snapshot-cache`: carrying forward a failed source's last known-good offers SHALL also carry forward the leaflet pages those offers reference, or their crops would dangle.
- `deals-browsing-ui`: an offer's image may come from a direct URL or from a region of a leaflet page; when neither exists, a category placeholder tile is shown instead of collapsing the image area.

## Impact

- `shared/types/offer.ts`: add `BoundingBox2d`, `OfferImageCrop`, `LeafletPage`; add `Offer.imageCrop`; add `DealsSnapshot.leafletPages`.
- `server/utils/scrapers/bounding-box.ts` (new): box sanitization and overlap rejection, pure and unit-tested.
- `server/utils/scrapers/billa.ts`, `server/utils/scrapers/lidl-leaflet.ts`: prompt and response-schema additions, a second page-image size, and a `{ offers, leafletPages }` return shape.
- `server/utils/sync.ts`: source ingest results widen from `Offer[]` to `{ offers, leafletPages? }`; page maps merge, carry forward per source, and are pruned of unreferenced entries before publication.
- `server/api/deals.get.ts`: `EMPTY_SNAPSHOT` gains `leafletPages: {}`.
- `app/components/ProductThumb.vue` (new) and `app/components/DepartmentPlaceholder.vue` (new, minimal here — enriched by `add-product-departments`).
- `test/fixtures/lidl-flyer-weekly.json` must be refreshed: it carries only `{number, zoom}` per page, while the live API returns `image`, `thumbnail`, `width`, and `height` as well.
- Operational, easy to miss: the `billa:last-publication-slug` and `lidl-leaflet:last-slug` KV keys must be deleted after deploy, or change detection short-circuits and no crops are produced until the next weekly leaflet rollover.
