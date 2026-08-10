## 1. OfferCard layout rework

- [x] 1.1 Change the outer `<article>` in `app/components/OfferCard.vue` from `flex flex-col gap-2 ... p-4` to a horizontal `flex gap-3 ... p-3`.
- [x] 1.2 Wrap `<ProductThumb>` in a fixed-size `shrink-0` box (`h-24 w-24 sm:h-28 sm:w-28`, matching `PriceComparisonCard.vue`) instead of letting it render at `size="full"`.
- [x] 1.3 Wrap the remaining fields in a `flex min-w-0 flex-1 flex-col gap-1` right-hand column: retailer/discount row, brand, name, unit text, price row, loyalty/mechanic badges, purchase limit, valid-until date, category + source link — keeping every field, none removed.
- [x] 1.4 Replace the bordered footer block (`border-t pt-2`) for category + source link with a plain compact row inside the same column (no top border/extra padding).
- [x] 1.5 Add `min-w-0` and `break-words` (and a 2-line `line-clamp-2` cap, matching `PriceComparisonCard.vue:97`) to the product name so long names wrap instead of overflowing or pushing the row wider.

## 2. Verification

- [x] 2.1 Run the dev server and open `/deals`; confirm cards render image-left/text-right and noticeably more offers fit on one screen than before.
- [x] 2.2 Visually compare `/deals` cards against the home page's `PriceComparisonCard` for consistent spacing/sizing.
- [x] 2.3 Check offers missing optional fields (no brand, no discount, no loyalty/mechanic badge, no purchase limit) — confirm no empty gaps are left in the layout.
- [x] 2.4 Check an offer with a long product name — confirm it wraps within the text column without overlapping the image or overflowing the card.
- [x] 2.5 Check the single-column mobile width and, if a dark mode toggle exists, both themes.
