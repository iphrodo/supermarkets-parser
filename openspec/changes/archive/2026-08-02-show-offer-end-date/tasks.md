## 1. Offer card end date

- [x] 1.1 Add a `formatDate` helper in `app/components/OfferCard.vue` that turns `offer.validUntil` (ISO date string) into a human-readable date (e.g. `31.08.2026`).
- [x] 1.2 Render the formatted end date on the card, near the price or in the footer metadata row.
- [x] 1.3 Add a component test (Vitest, e.g. `app/components/__tests__/OfferCard.test.ts`) asserting the formatted end date is rendered for a sample offer.

## 2. Verification

- [x] 2.1 Run `pnpm test` (or the project's test command) and confirm it passes.
- [x] 2.2 Manually check the deals page renders the end date on both a Kaufland and a Lidl offer card.
