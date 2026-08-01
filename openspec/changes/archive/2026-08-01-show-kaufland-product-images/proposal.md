## Why

Kaufland offers already carry a populated `imageUrl` field from ingestion (see `deal-catalog` spec and the archived `add-kaufland-image-support` change), but the offer card UI never renders it. Shoppers scanning the deals list currently see only text, making it harder to recognize products at a glance even though the data needed to show a photo is already in the catalog.

## What Changes

- Render the product image on each offer card when `offer.imageUrl` is present.
- Since `imageUrl` only exists on Kaufland offers (never on Lidl offers, per the `deal-catalog` schema), the image area only ever appears on Kaufland cards.
- When a Kaufland offer has `imageUrl: null`, and for all Lidl offers (where the field is structurally absent), render the card without an image area rather than a broken image or empty gap.
- Handle image load failures (broken URL, network error) by falling back to the no-image layout instead of showing a broken-image icon.

## Capabilities

### Modified Capabilities
- `deals-browsing-ui`: offer cards must display the product image when available and degrade gracefully when it is not.

## Impact

- `app/components/OfferCard.vue`: add an image element and no-image fallback state.
- No backend, schema, or scraper changes — `imageUrl` is already populated by existing ingestion.
