## 1. Hero resolution

- [x] 1.1 In `app/utils/hero-image.ts`, reorder the candidate steps to: cheapest entry's `imageUrl`, cheapest entry's resolvable crop, any entry's `imageUrl`, any entry's resolvable crop, `null`.
- [x] 1.2 Rewrite the function's doc comment so the stated order and its rationale (attribution over image quality; cross-entry fallback only when the cheapest entry has no imagery) match the code.

## 2. Tests

- [x] 2.1 Invert `prefers a photograph over a crop even when the crop is the cheapest entry's` into a case asserting the cheapest entry's crop wins over another entry's photograph, renaming it accordingly.
- [x] 2.2 Add a case for the cross-entry fallback: the cheapest entry has no imagery, one other entry has a crop and another has a photograph — the photograph wins.
- [x] 2.3 Confirm the remaining cases still hold, in particular that a crop whose page is absent from the snapshot is not treated as imagery for the cheapest entry either.
- [x] 2.4 Run `npx vitest run app/utils/__tests__/hero-image.test.ts app/components/__tests__/PriceComparisonCard.test.ts app/pages/__tests__` and confirm green.

## 3. Verification

- [x] 3.1 Run the app against a real snapshot and confirm a group where Billa is cheapest (e.g. кашу, бадеми, кайма) now shows the Billa crop next to the Billa price.
- [ ] 3.2 Confirm a group whose cheapest entry is a Lidl price-list offer still borrows another entry's photograph rather than showing the placeholder, and that an all-price-list group still shows the placeholder.
