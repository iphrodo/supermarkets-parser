## 1. Shared types

- [x] 1.1 In `shared/types/offer.ts`, add `BoundingBox2d` (a 4-tuple of numbers, documented as `[ymin, xmin, ymax, xmax]` normalized to 0–1000 to match Gemini's trained convention).
- [x] 1.2 Add `OfferImageCrop { pageId: string; box: BoundingBox2d }` and `LeafletPage { imageUrl: string; width: number; height: number; pageNumber: number; sourceUrl: string }`, documenting that `LeafletPage.imageUrl` is deliberately a smaller variant than the one used for vision extraction.
- [x] 1.3 Add `imageCrop?: OfferImageCrop | null` to `Offer`, alongside the existing `imageUrl?: string | null`, keeping the established "structurally absent per source" posture.
- [x] 1.4 Add `leafletPages: Record<string, LeafletPage>` to `DealsSnapshot`.

## 2. Bounding-box validation

- [x] 2.1 Create `server/utils/scrapers/bounding-box.ts` with `sanitizeBox(raw: unknown): BoundingBox2d | null` — reject unless exactly four finite integers; clamp each into `[0, 1000]`; reject when `ymin >= ymax` or `xmin >= xmax` after clamping (reject, do **not** swap — an inverted box usually means the model emitted `xmin,ymin,xmax,ymax` and swapping yields a confidently wrong crop).
- [x] 2.2 In the same module, reject boxes whose shorter side is below 25/1000 of the page, whose area exceeds 25% of the page, or whose aspect ratio falls outside 1:4–4:1.
- [x] 2.3 Pad each surviving box by 4% per side, clamped to page bounds, so tight boxes do not shave the product.
- [x] 2.4 Add `rejectOverlappingBoxes<T extends { box: BoundingBox2d }>(items: T[]): T[]` — pairwise IoU within a single page; when IoU > 0.5, drop the box from **both** items.

## 3. Billa ingestion

- [x] 3.1 In `server/utils/scrapers/billa.ts`, add `box_2d: number[] | null` and `boxConfident: boolean` to `BillaExtractedItem`, and to `EXTRACTION_RESPONSE_SCHEMA` (`box_2d` as a nullable integer array; `boxConfident` in `required`). Do not use `minItems`/`maxItems` — they are string-typed in `@google/genai`; validate length in code instead.
- [x] 3.2 Add `propertyOrdering` to the item schema with `box_2d` first, so the model localizes before describing.
- [x] 3.3 Extend `EXTRACTION_PROMPT` with the box instructions: the box covers the product's **photograph**, not its price bubble, badge, or text block; null when the offer has no photo of its own; `boxConfident` true only when the box tightly encloses exactly one product's photo; and an explicit rule that a box belongs to exactly one offer — if two offers share a photograph, neither gets it.
- [x] 3.4 Add `CLIENT_PAGE_IMAGE_SIZE = 'at800'` alongside `PAGE_IMAGE_SIZE = 'at1600'`; have `fetchPageImageRefs` return both URLs per page, parsing `width`/`height` from the `fit-in/(\d+)x(\d+)/` segment of the client URL (Publitas page objects carry no dimensions).
- [x] 3.5 In `mapExtractedItem`, run the box through `sanitizeBox`, drop it when `boxConfident` is false, and set `imageCrop` from the surviving box plus the page's `pageId`. A rejected box SHALL NOT drop the offer.
- [x] 3.6 Apply `rejectOverlappingBoxes` per page before mapping items to offers.
- [x] 3.7 Change `parseBillaExtraction` to take the publication slug and return `{ offers, leafletPages }`, keying pages as `` `billa:${slug}:${pageNumber}` ``.
- [x] 3.8 Report box rejections as a single aggregate line through the existing `logWarning` dep (e.g. `Billa ingestion: dropped 37 of 412 product image boxes (low confidence / failed sanity checks)`), **not** in `offer.warnings`.

## 4. Lidl leaflet ingestion

- [x] 4.1 Mirror tasks 3.1–3.3 in `server/utils/scrapers/lidl-leaflet.ts` for `LidlLeafletExtractedItem` and its schema and prompt.
- [x] 4.2 Extend the `LidlFlyerPage` interface with `image: string`, `width: number`, `height: number` (all confirmed present in the live flyer payload); keep `zoom` as the vision-side image and use `image` as the client-side one. The `width`/`height` are the original page dimensions — only their ratio is used, so no rescaling is needed.
- [x] 4.3 Mirror tasks 3.5, 3.6, and 3.8 for this source.
- [x] 4.4 Change `parseLidlLeafletExtraction` to return `{ offers, leafletPages }`, keying pages as `` `lidl-leaflet:${slug}:${pageNumber}` ``.
- [x] 4.5 Refresh `test/fixtures/lidl-flyer-weekly.json` so page objects match the live shape (12 fields including `image`, `thumbnail`, `width`, `height`) instead of only `{number, zoom}`.

## 5. Sync wiring

- [x] 5.1 In `server/utils/sync.ts`, widen the source ingest contract from `() => Promise<Offer[]>` to `() => Promise<{ offers: Offer[]; leafletPages?: Record<string, LeafletPage> }>`; Kaufland and Lidl XLSX return `{ offers }`.
- [x] 5.2 Merge all sources' page maps with `Object.assign` after `mergeCatalog`.
- [x] 5.3 In the partial-failure carry-forward path, restore both a failed source's offers and the previous snapshot's `leafletPages` entries whose key carries that source's prefix.
- [x] 5.4 Prune `leafletPages` to entries referenced by a surviving offer's `imageCrop.pageId` before publishing, so stale pages do not accumulate week over week.
- [x] 5.5 Add `leafletPages: {}` to `EMPTY_SNAPSHOT` in `server/api/deals.get.ts`.

## 6. Thumbnail component

- [x] 6.1 Create `app/components/DepartmentPlaceholder.vue` — a tinted tile with an icon and no text overflow, sized by its container. (It takes a department once `add-product-departments` lands; until then it renders a neutral generic tile.)
- [x] 6.2 Create `app/components/ProductThumb.vue` taking `{ offer, page, size }` and resolving three modes: `offer.imageUrl` → plain `<img class="object-contain">`; `offer.imageCrop` + a resolved `page` → CSS crop; otherwise → `DepartmentPlaceholder`. An `@error` handler falls through to the placeholder.
- [x] 6.3 Implement the crop geometry: outer element `relative overflow-hidden` with a **fixed** inline `aspect-ratio` (square, shared by all three modes); inner `<img class="absolute max-w-none">` fitted into it `contain`-style — `fitW = min(1, cropRatio)`, `fitH = min(1, 1/cropRatio)`, then `width: fitW/wFrac`, `height: fitH/hFrac`, `left: (1-fitW)/2 - (xmin/1000)*(fitW/wFrac)`, `top: (1-fitH)/2 - (ymin/1000)*(fitH/hFrac)`, all as percentages. **`max-w-none` is mandatory** — Tailwind preflight's `img { max-width: 100% }` silently breaks every crop otherwise. *(Revised from taking the aspect ratio from the crop, which made card heights depend on box shape — see the findings below.)*
- [x] 6.4 Set `loading="lazy" decoding="async" fetchpriority="low"` and an `alt` of the offer name. Do **not** set `crossorigin` (the hosts send no CORS headers) and do **not** override `referrerpolicy` (a foreign `Referer` is verified working; "no Referer" is not).
- [x] 6.5 Render `OfferCard.vue` through `ProductThumb` so both surfaces share one image path, replacing its local `imageLoadFailed` handling.

## 7. Tests

- [x] 7.1 `server/utils/scrapers/__tests__/bounding-box.test.ts`: a valid box passes; 3-element, non-integer, and NaN inputs are rejected; inverted axes are rejected (not swapped); a sub-2.5% sliver is rejected; an area above 25% is rejected; a 5:1 aspect is rejected; padding clamps at page edges; an IoU-0.7 pair loses both boxes; an IoU-0.2 pair keeps both.
- [x] 7.2 Extend the Billa and Lidl-leaflet scraper tests with `box_2d`/`boxConfident` fixture data: `imageCrop` is populated for good boxes, absent for bad ones **with the offer retained**, and `leafletPages` keys match the emitted `pageId`s.
- [x] 7.3 Extend the sync tests: page maps merge across sources; a failing leaflet source carries forward only its own pages; unreferenced pages are pruned.
- [x] 7.4 `app/components/__tests__/ProductThumb.test.ts`: crop mode computes the expected width/left percentages; `imageUrl` mode renders a plain lazy `<img>`; no-image mode renders the placeholder; an image error falls back to the placeholder.
- [x] 7.5 Add `stories/ProductThumb.stories.ts` covering crop, plain, placeholder, and broken-URL states.
- [x] 7.6 Update `app/pages/__tests__/fixtures.ts`: `makeOffer` gains `imageCrop: null`, `makeSnapshot` gains `leafletPages: {}`.
- [x] 7.7 Add a `"typecheck": "nuxt typecheck"` script — `npm run build` is currently the only type gate and `vue-tsc` is not a dependency.

## 8. Verification

- [x] 8.1 Run `npx vitest run --project unit`, `--project app`, and `--project storybook`, plus `npm run build`. — unit (131) and app (21) pass, `npm run build` and the new `npm run typecheck` pass. The `storybook` project fails to import any story file (`aria-query` does not export `elementRoles`, from `@storybook/addon-vitest`'s setup file); verified failing identically on a clean `main`, so it predates this change and is not addressed here.
- [x] 8.2 **Delete `billa:last-publication-slug` and `lidl-leaflet:last-slug` from Upstash** before the first sync — otherwise change detection reuses the previous snapshot's offers and produces zero crops, which reads as a failed prompt. — done: both keys read, backed up (with the full snapshot) to the session scratchpad, then deleted; confirmed null afterwards.
- [x] 8.3 Trigger a sync (`POST /api/cron/sync-deals` with the bearer secret) and watch stderr for the aggregate box-rejection counts. — done: built server on :3199, `POST /api/cron/sync-deals` returned `{"published":true,"reason":"partial","offerCount":1594}` in 109 s. stderr: `Billa ingestion: dropped 227 of 360 product image boxes (low confidence / failed sanity checks)`. Lidl leaflet failed on a **pre-existing** source-selection error (`Ambiguous weekly leaflet: found 2 candidates with a 7-day validity window`), unrelated to this change — it was already `ok:false` in the prior snapshot.
- [x] 8.4 Inspect the written snapshot: `Object.keys(leafletPages).length` should be roughly 50 (Billa) plus 20–30 (Lidl); compute crop coverage as offers with `imageCrop` over total leaflet offers. Coverage below ~50% means the prompt needs tuning, not that the approach is wrong. — done, with deviations. `leafletPages` = 17, not ~50+20-30: Lidl contributed 0 (source failed, above), and Billa registers a page only when a crop survives on it — its price/validity gating passes just 134 offers out of ~50 pages, which land on 17 pages. **Billa crop coverage is 132/134 = 98.5%**, far above the ~50% bar. Invariants verified against the live snapshot: 0 crops pointing at a missing page, 0 unreferenced registry entries, 0 boxes out of bounds or inverted, 0 duplicate boxes, box area 1.0–10.5% (cap 25%), aspect 0.33–3.84 (cap 1:4–4:1), display variant is `at800` (676x947). Structural posture holds: 0 Billa offers carry `imageUrl`, 0 Kaufland offers carry `imageCrop`, 0 box messages leaked into `offer.warnings`.
- [x] 8.5 Build a temporary `app/pages/dev/crops.vue` QA page rendering every leaflet offer's crop beside its extracted name, grouped by page, and review it — this is the only practical way to judge box accuracy, and it takes minutes. — page is built (it also reports page count and crop coverage, covering 8.4); the review itself is blocked on 8.2/8.3 producing a snapshot with crops. — done: page built and reviewed via headless Chromium. Box accuracy is good — 10/10 correct products on page 1 (salami, chips, beer, Heineken multipack, sweet corn, trout, chicken, kashkaval, sunflower oil, toilet paper), clean single-product crop on page 18. Framing is looser than the prompt asks: several crops include the price bubble or discount badge. **Found a layout defect — see the note under section 6 below.**
- [x] 8.6 In the browser with DevTools throttled to Fast 3G, confirm image bytes on first paint stay around 1–1.5 MB and that scrolling lazily loads further crops rather than all at once. — done, over budget. Fast 3G (1.6 Mbit/s, 562 ms RTT) on `/deals`: **2.08 MB across 21 images at first paint**, above the 1–1.5 MB expectation. Lazy loading works as designed — 18 further images loaded only after scrolling to the bottom (39 / 3.97 MB total). The default view is Kaufland-dominated (~180 KB uncompressed JPEGs each), which the design already flagged as the existing baseline rather than something this change introduces.
- [x] 8.7 Confirm placeholder tiles (never gaps, never broken-image icons) where no image resolves, in both light and dark mode. — done: verified on `/deals` filtered to Lidl (24/24 cards show the placeholder tile) and to Billa (24/24 show crops), in both light and dark mode. 0 broken images, 0 zero-height thumbnails, no empty gaps in any of the four combinations.

## Findings from verification

- **Tall crops blew up card height — fixed.** Task 6.3's geometry gives the thumbnail container the crop's own aspect ratio at 100% width, so a 1:3 portrait crop (a salami stick, a beer can) renders roughly three times taller than a landscape crop next to it, and the grid row stretches to match. The crops themselves are correct and undistorted; the problem is that card height is now driven by whatever shape the model boxed. The `deals-browsing-ui` spec asks for the crop "scaled to the card's image area", which reads as a stable area the crop fits into rather than one it defines. Fixed by letterboxing the crop inside a fixed-aspect (square) tile — scale to fit, centre, keep proportions — instead of taking the aspect ratio from the box. Task 6.3 and design.md were updated to match, and the change was re-verified against the live snapshot.
- **Billa box framing includes price bubbles.** Coverage is high and products are right, but the prompt's "not its price bubble, badge, or text block" rule is only loosely obeyed. Prompt tuning, not an architectural problem.
- **Lidl leaflet ingestion is currently broken for an unrelated reason.** `selectWeeklyFlyer` requires exactly one candidate with a 7-day validity window and currently finds two, so the source failed and contributed no crops. Pre-existing; worth its own change.
