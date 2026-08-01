## 1. Offer card image display

- [x] 1.1 Add an image element to `app/components/OfferCard.vue` that renders `offer.imageUrl` when present
- [x] 1.2 Add an `@error` handler (or equivalent) that hides the image and falls back to the no-image layout when the image fails to load
- [x] 1.3 Ensure the no-image case (null `imageUrl`, or Lidl offers where the field doesn't exist) renders the card without a broken-image placeholder or layout gap

## 2. Verification

- [x] 2.1 Manually verify in the running app that Kaufland offers with images show the image, Kaufland offers with null `imageUrl` and Lidl offers render cleanly without one, and a deliberately broken URL falls back gracefully
- [x] 2.2 Run existing component/unit tests and add coverage for the new rendering branches if a test file for `OfferCard.vue` exists
