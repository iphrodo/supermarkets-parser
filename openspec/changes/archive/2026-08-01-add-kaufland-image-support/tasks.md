## 1. Shared schema

- [x] 1.1 Add `imageUrl: string | null` to the `Offer` interface in `shared/types/offer.ts`, placed near `ean` since both derive from the same source field.

## 2. Kaufland scraper

- [x] 2.1 In `server/utils/scrapers/kaufland.ts`, set `imageUrl: raw.listImage ?? null` in `mapOffer()`, independent of the `deriveEan()` call/result.
- [x] 2.2 Confirm `deriveEan()` itself is unchanged (still only responsible for `ean`, not `imageUrl`).

## 3. Tests

- [x] 3.1 Update `server/utils/scrapers/__tests__/kaufland.test.ts` assertions that check the full mapped `Offer` shape to include the expected `imageUrl`.
- [x] 3.2 Add a test case: tile with a `listImage` that has no barcode-like segment still produces a populated `imageUrl` and a null `ean`.
- [x] 3.3 Add a test case: tile with no `listImage` at all produces `imageUrl: null` and `ean: null`.
- [x] 3.4 Verify Lidl scraper tests are unaffected (no `imageUrl` expected on Lidl-mapped offers).

## 4. Verification

- [x] 4.1 Run the full test suite and confirm no other snapshot/fixture assertions on the `Offer` shape break.
- [x] 4.2 Run `openspec validate add-kaufland-image-support --strict` and fix any reported issues.
