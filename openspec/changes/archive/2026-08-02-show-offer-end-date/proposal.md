## Why

The catalog already stores each offer's `validUntil` date, but the offer card never displays it, so a shopper browsing the deals page cannot tell when a discounted price stops being valid.

## What Changes

- Show the offer's end date (`validUntil`) on the offer card in the deals listing, formatted as a human-readable date.
- Format the date so it is unambiguous regardless of locale (e.g. day-month-year with a month name or a clearly ordered numeric format), instead of a raw ISO string.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deals-browsing-ui`: offer cards must additionally surface the offer's valid-until date.

## Impact

- `app/components/OfferCard.vue`: render a formatted end date using the existing `offer.validUntil` field.
- No changes needed to `shared/types/offer.ts` or the scrapers/normalizers — `validUntil` is already populated for both Kaufland and Lidl offers.
