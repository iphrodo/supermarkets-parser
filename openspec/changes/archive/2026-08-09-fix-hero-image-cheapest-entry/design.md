## Context

See proposal.md — Why. `resolveHeroOffer` (`app/utils/hero-image.ts`) is the single place a comparison card's image is chosen; it walks the group's entries, which the comparison builder already emits cheapest-first, and returns one offer for `ProductThumb` to render.

Two facts about the data shape the ordering. Imagery is a property of the source, not of the offer: Kaufland and the Lidl product listing publish `imageUrl`, Billa publishes `imageCrop`, the Lidl price list publishes neither, and no source publishes both. And a crop is usable only if the leaflet page it points at is in the same snapshot — a crop whose page was not carried forward is no imagery at all, not a broken image.

This change reverses a decision recorded in `redesign-comparison-landing` design.md ("One hero image per card, not one per retailer row"). That document stays as the archived record of what was decided then; this one supersedes its ordering.

## Goals / Non-Goals

**Goals:**
- The card's image and its headline price describe the same offer whenever the data allows it.
- Keep the resolution a single pure function over (group, offer lookup, page registry), testable without a component.

**Non-Goals:**
- Per-retailer thumbnails on the card. Still one image per card; per-retailer imagery stays in the details view.
- Changing what any scraper publishes, or teaching Billa to emit product photographs.
- Cropping, upscaling, or otherwise improving how a leaflet crop renders — `ProductThumb` already fits it into the tile and is untouched.

## Decisions

### Attribution outranks image quality

The candidate order becomes: cheapest entry's `imageUrl`, cheapest entry's resolvable crop, any entry's `imageUrl`, any entry's resolvable crop, placeholder. Only steps 2 and 3 swap relative to today.

The alternative — keep the photograph first and mark the image as belonging to another retailer (a small "снимка: Kaufland" caption) — was rejected. It adds a line of secondary text to a card the redesign deliberately stripped of secondary text, and it fixes the misunderstanding by explaining it rather than removing it. A shopper scanning a grid does not read captions.

A leaflet crop is genuinely the weaker picture: it is a region of a scanned page, often with neighbouring products or price flashes at its edges. Accepting that is the point of the change — a rougher picture of the right product beats a clean picture of a different, more expensive one on a page whose entire purpose is "this one is cheaper".

Keeping `imageUrl` ahead of the crop *within* the cheapest entry costs nothing today (no source emits both) and gives a deterministic answer if one ever does.

### Falling back across entries stays, and stays unlabelled

When the cheapest entry has no imagery at all — a Lidl price-list offer — the card still borrows another entry's picture rather than dropping to the placeholder. The group is one canonical product type, so a same-type photograph is informative, and the alternative is a grey tile on a card that has a perfectly good picture available. This is the same trade as before, now confined to the case where there is no honest alternative rather than applied whenever any retailer happens to publish a URL.

### The load-failure fallback is not part of this

`ProductThumb` falls back to the placeholder when the chosen image fails to load; it does not ask for the next candidate. That stays as-is. Making the fallback chain reactive to load failures would mean lifting `loadFailed` state out of the thumbnail and re-resolving, for a case that is rare and already lands on a defined state.

## Risks / Trade-offs

- **Cards visibly get uglier where Billa is cheapest** → That is the intended trade, and it is the majority of affected cards. If the crops turn out to be worse than the screenshots suggest, the lever is crop quality in `billa-offer-ingestion` (bounding-box gating), not the resolution order.
- **The archived design doc now contradicts the code** → The archived change is a record of a past decision, not live guidance; this design states the supersession explicitly, and the live contract is the main spec, which this change updates.
- **Regression risk is confined to one function** → Its behavior is fully covered by `app/utils/__tests__/hero-image.test.ts`; one existing case asserts the removed behavior and inverts, and the new fallback case gets its own.
