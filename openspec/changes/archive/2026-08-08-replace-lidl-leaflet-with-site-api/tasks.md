## 1. Fixture

- [x] 1.1 Capture a real response page and save it as `test/fixtures/lidl-site-search.json`: `curl -A "<desktop UA>" "https://www.lidl.bg/q/api/search?assortment=BG&locale=bg_BG&version=v2.0.0&fetchsize=108&offset=0"`
- [x] 1.2 Trim the fixture to a hand-picked set of ~15 products that covers every branch: live+discounted+food, future `validFrom`, past `validUntil`, non-food (`wonCategoryPrimaryPath` second segment ≠ 17/10), structured `percentageDiscount` with `oldPrice > 0`, `discountText: "34% по-евтино"` with `oldPrice: 0`, `discountText: "Акция"` with no percentage, no `price.price`, no `image`, and an entry with no `gridbox`
- [x] 1.3 Save a second small fixture representing page 2 of the same result set, for the pagination test — it must repeat one `erpNumber` from page 1 so dedupe is exercised

## 2. Shared types

- [x] 2.1 In `shared/types/offer.ts`, rename `DealsSnapshot.sources.lidlLeaflet` to `lidlSite`
- [x] 2.2 Confirm no other type change is needed — `Offer.imageUrl` already exists and is what this source populates

## 3. New scraper

- [x] 3.1 Create `server/utils/scrapers/lidl-site.ts` exporting `LIDL_SITE_SEARCH_URL`, `LIDL_SITE_SOURCE_URL_PREFIX`, `LidlSiteIngestionError`, `parseLidlSiteResponse`, `fetchLidlSiteOffers`, `isLidlSiteOffer`
- [x] 3.2 Define the response types for the fields listed in design.md's field table; treat everything as optional and validate at the boundary rather than trusting the shape
- [x] 3.3 Implement `parseLidlSiteResponse(pages, now)`: flatten `items[].gridbox.data`, skip entries without a `gridbox`, dedupe by `erpNumber`
- [x] 3.4 Implement the filter chain in order — structured validity present → window contains `now` → `wonCategoryPrimaryPath` second segment is `17` or `10` → numeric `price.price` present → a discount indication present
- [x] 3.5 Implement discount resolution: `percentageDiscount` → `/(\d+)\s*%/` on `discountText` → `0` plus a warning naming the unparsed label
- [x] 3.6 Map to `Offer` per design.md: prices via `Math.round(value * 100)`, `oldPrice: 0` → `originalPriceEurCents: null`, dates from Unix seconds to `YYYY-MM-DD`, `sourceUrl` from `canonicalPath`, `category` from `wonCategoryPrimary`, `ean: null`, `scope: 'national'`, `store: null`, `loyaltyTier: 'none'`, `mechanic: 'standard'`
- [x] 3.7 Construct the offer object so `imageCrop` is absent as a key, not set to `null`
- [x] 3.8 Add a warning when `lidlPlus` is non-empty (Lidl Plus pricing is out of scope) and when `discountText` describes a quantity promotion such as `"27% безплатно"`
- [x] 3.9 Reuse `computeProductKey` / `computeOfferKey` from `server/utils/normalize.ts` — no new identity logic
- [x] 3.10 Implement `fetchLidlSiteOffers()`: request `fetchsize=108&offset=0`, read `numFound`, advance the offset by the number of items actually returned, stop at `numFound` or after 20 pages, then call `parseLidlSiteResponse`. Wrap network and parse failures in `LidlSiteIngestionError`
- [x] 3.11 Send a desktop browser `User-Agent`, matching the existing Kaufland scraper's practice
- [x] 3.12 Log the post-filter offer count so a category-id or schema change surfaces as a visible collapse rather than silently

## 4. Remove the leaflet source

- [x] 4.1 Delete `server/utils/scrapers/lidl-leaflet.ts` and `server/utils/scrapers/__tests__/lidl-leaflet.test.ts`
- [x] 4.2 Delete `test/fixtures/lidl-broshura-listing.html`, `test/fixtures/lidl-flyer-weekly.json`, `test/fixtures/lidl-flyer-campaign.json`
- [x] 4.3 Remove `LIDL_LEAFLET_SLUG_KEY` and its reader/writer from `server/utils/kv.ts`
- [x] 4.4 Confirm `server/utils/scrapers/vision-extraction.ts` and `server/utils/scrapers/bounding-box.ts` still build and are still referenced by Billa — they stay

## 5. Sync wiring

- [x] 5.1 In `server/utils/sync.ts`, replace the `lidlLeaflet` `SourceConfig` with `{ key: 'lidlSite', label: 'Lidl site', fetch: deps.fetchLidlSiteOffers, belongsToSource: isLidlSiteOffer }` — no `pageIdPrefix`
- [x] 5.2 Rename `RunSyncDeps.fetchLidlLeafletOffers` to `fetchLidlSiteOffers` and update the imports at the top of the file
- [x] 5.3 Update the three call sites: `server/api/cron/sync-deals.ts`, `server/plugins/catch-up-sync.ts`, and `EMPTY_SNAPSHOT` in `server/api/deals.get.ts`
- [x] 5.4 Make snapshot reading tolerate a missing per-source status key, defaulting to `{ scrapedAt: null, ok: false }`, so a snapshot written before the rename is still usable for carry-forward
- [x] 5.5 Verify by reading the code that a pre-rename snapshot's Lidl leaflet offers are claimed by no source and so are not carried forward, and that `pruneUnreferencedPages` then drops their pages

## 6. Tests

- [x] 6.1 Create `server/utils/scrapers/__tests__/lidl-site.test.ts` driven entirely by the fixtures — no network
- [x] 6.2 Pagination: two pages are concatenated, the repeated `erpNumber` yields one offer, and the loop stops at `numFound`
- [x] 6.3 Filtering: future `validFrom` excluded, past `validUntil` excluded, non-food excluded, priceless excluded, undiscounted excluded — each asserted independently against an injected `now`
- [x] 6.4 Discount: `percentageDiscount` preferred; `"34% по-евтино"` parsed to `34`; `"Акция"` yields `0` plus a warning; `oldPrice: 0` yields `originalPriceEurCents: null`
- [x] 6.5 Image: `imageUrl` is the published URL verbatim, and `'imageCrop' in offer` is `false`
- [x] 6.6 Identity: `ean` is `null` even when `ians` is populated, and `productKey` is the `name:` hash form
- [x] 6.7 Provenance: `sourceUrl` is `https://www.lidl.bg` + `canonicalPath`, `retailer` is `lidl`, and `isLidlSiteOffer` distinguishes these offers from `isLidlXlsxOffer`'s
- [x] 6.8 Failure: a malformed payload throws `LidlSiteIngestionError` rather than returning an empty array
- [x] 6.9 Update `server/utils/__tests__/sync.test.ts` for the renamed source key, including a carry-forward case for `lidlSite` and a case where the previous snapshot has no `lidlSite` key at all
- [x] 6.10 Grep the repo for remaining `lidlLeaflet` / `lidl-leaflet` references and remove or update each

## 7. Specs and docs

- [x] 7.1 Add a note to `HANDOFF_parcer.md` §4.2 correcting the "Playwright/retcat API not needed" conclusion — record that `/q/api/search` is public and was the right route all along, so the finding is not re-derived later
- [x] 7.2 Update `openspec/changes/add-leaflet-product-image-crops/tasks.md` finding 3 to note that the broken Lidl leaflet source is resolved by removal in this change, so that change can be archived cleanly

## 8. Verification

- [x] 8.1 `npx vitest run --project unit` and `npx vitest run --project app` pass; `npm run typecheck` and `npm run build` pass. The `storybook` project's `aria-query` failure is pre-existing on `main` — confirm it fails identically there before dismissing it — done: 24 files / 168 tests pass across `unit` + `app` (30 of them the new `lidl-site` suite); `typecheck` and `build` clean. The `storybook` project fails 4 suites on `aria-query … does not provide an export named 'elementRoles'`; re-run with the whole change stashed (`git stash -u`) it fails identically, so it is pre-existing.
- [x] 8.2 Delete the `lidl-leaflet:last-slug` key from Upstash — done: no action needed. The key already read `null` before this change's sync — `add-leaflet-product-image-crops` task 8.2 deleted it, and the leaflet source has failed on every run since, so `writeLastLidlLeafletSlug` never rewrote it. Verified by reading it directly, and the read was backed up alongside the pre-change snapshot.
- [x] 8.3 Run a live sync (`curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/sync-deals`) and record `published`, `reason`, and the per-source `ok` flags. Expect `sources.lidlSite.ok === true` with roughly 200 offers — done: built server on :3199, `POST /api/cron/sync-deals` returned `{"published":true,"reason":"success","offerCount":1430}` in 63 s — the first all-four-sources-green run since the leaflet source started failing. All four `ok: true`, `sources.lidlSite.scrapedAt: 2026-08-08T04:14:02Z`. stderr: `Lidl site ingestion: 175 live discounted food offer(s) from 639 listing entries`. 174 reached the snapshot; the one lost is a genuine `offerKey` collision, not a bug — see the finding below. 175 rather than the design's 211 is which week's promotions happen to be live, not a defect — the same filter over the same catalogue measured 211 on the day design.md was written.
- [x] 8.4 Inspect the published snapshot: every Lidl site offer has a non-empty `imageUrl`; none has an `imageCrop` key; `leafletPages` contains only `billa:`-prefixed keys; every `validUntil` is today or later; no offer has `ean` set — done, all five hold: 174/174 with a non-empty `imageUrl`, 0 carrying an `imageCrop` key, `leafletPages` keys all `billa:`-prefixed, 0 with `validUntil` before today (`validUntil` ∈ {2026-08-09, 2026-08-16}), 0 with an `ean`. Also confirmed the migration happened by construction: 0 leftover `/broshura/` offers survived, down from 339 in the previous snapshot.
- [x] 8.5 `npm run dev`, open `/` filtered to Lidl and confirm real product photographs replace the placeholder tiles; check the same on `/deals` — done for `/deals` via headless Chromium: filtered to Lidl, 25 images render, all from `imgproxy-retcat.assets.schwarz`, 0 broken, 0 zero-height. Screenshot confirms real packshots (луканка XXL, roast chicken, bread, salmon) where `add-leaflet-product-image-crops` task 8.7 had recorded 24/24 placeholder tiles. The placeholders still visible belong to the 23 XLSX price-list offers, which carry no image by design. **`/` could not be checked as written**: the landing page is now the cross-store comparison view, which has no retailer filter (its only selects are `savings`/`label` sort) and renders no product thumbnails at all — `ProductThumb` is used by `OfferCard`, not `PriceComparisonCard`. Pre-existing, and untouched by this change.
- [x] 8.6 Compare the number of comparison groups containing all three retailers before and after — it should rise, since Lidl now contributes ~200 live promotions instead of the XLSX's 23 — done, and **the expectation is not met: three-retailer groups fell from 28 to 26** (total groups 84 → 75, total offers 1594 → 1430). The task's premise was wrong. The previous snapshot was not "the XLSX's 23": it carried 339 leaflet offers scraped 2026-08-04, all still inside their 2026-08-03..09 window, and **all 28** of its three-retailer groups drew their Lidl entry from those. Lidl's contribution went 361 → 197 offers, so a small drop in group count is arithmetic, not a regression. It is also a one-week artefact: the leaflet source has failed every run since 2026-08-04 and cannot refresh, so those 339 offers expire on 2026-08-09 and Lidl would have collapsed to the XLSX's 23 next week. The 174 site offers refresh every run. See the finding below.
- [x] 8.7 Spot-check five offers against their `sourceUrl` product pages on lidl.bg: name, price, unit text, and validity dates must match what the site shows — done: all five `sourceUrl`s return 200 and their pages agree with the published offers. Луканка XXL 5.36 € / `34% по-евтино` / опаковка; Пилешко бутче 1.69 €; Пълнозърнест хляб 0.65 € / `-51%` / `/бр.`; Свински ребра 10.22 € / `Акция` (published as `discountPercentage: 0` plus the unquantified-reduction warning, as specified) / `за kg`; Кайма 4.34 €. Every page shows `в магазините от 03.08. - 09.08.`, matching the published `validFrom: 2026-08-03` / `validUntil: 2026-08-09` — which is also the live confirmation of the timezone fix in the finding below.

## Findings from verification

- **The validity timestamps are Sofia-local midnight, so a UTC conversion dates every `validFrom` a day early.** design.md's field table says only "Unix seconds", and task 3.6 only "dates from Unix seconds to `YYYY-MM-DD`". Taken literally — `new Date(s * 1000).toISOString().slice(0, 10)` — the fixture's `1785704400` yields `2026-08-02`, while the product's own badge reads `в магазините от 03.08.`; `validUntil` happened to land on the right date, so the bug would have been half-invisible. Resolved by formatting through `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' })`, the idiom `server/utils/schedule.ts` already uses for Kyiv. Confirmed live in 8.7: all five spot-checked pages agree with the published dates.
- **Removing the leaflet source lowers the comparison-group count this week.** Recorded in full under 8.6. Worth knowing before reading the deploy's numbers as a regression: the before-figure was inflated by 339 carried-forward leaflet offers from a source that had already been failing for four days and would have gone dark on 2026-08-09.
- **`discountPercentage: 0` now has two meanings in published data.** 82 of the live food offers carry `discountText: "Акция"` with no percentage anywhere, so they publish as `0` plus a warning. design.md already flags this for `redesign-comparison-landing`'s min-savings filter; the live run confirms the volume is substantial, not marginal, so that filter would currently hide roughly half of Lidl's promotions.
- **Name+unit identity merges product variants that differ only by flavour.** 175 offers parse but 174 reach the snapshot: two distinct `erpNumber`s both named `MONSTER Енергийна напитка` at `500 ml/опаковка` hash to one `productKey`, so `computeOfferKey` gives them the same `offerKey` and `mergeCatalog` keeps one. This is the documented cost of the `name:` fallback (design.md — "`ians` is not an EAN"), not new: the XLSX and Billa sources have always had it. It is worth knowing that the site API makes it more visible, because it publishes a wider assortment than the XLSX. Publishing `ians` as `ean` would fix the collision and cause a far worse one across retailers; nothing to do here.
- **`lidlPlus` is never populated alongside a normal price in practice.** All 72 products carrying a Lidl Plus price publish no `price.price` at all, so they are dropped by the price filter before the task 3.8 warning can fire. The warning is implemented and unit-tested against a hand-built fixture entry, but it is defensive — it will not appear in real output unless Lidl starts publishing both prices on one product.
