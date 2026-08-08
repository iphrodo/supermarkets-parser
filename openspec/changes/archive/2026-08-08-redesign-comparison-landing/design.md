## Context

The landing page today is `useFetch('/api/deals')` feeding a single `computed` that substring-matches `group.labelBg` and sorts by one of two keys, rendered into a three-column grid through `useIncrementalList`. Every card receives the entire `offers` array and builds its own `Map` to resolve `offerKey`s. All state is component-local; nothing reaches the URL.

Reference patterns that informed the redesign:

- **Trolley.co.uk** (the closest analogue — UK grocery price comparison) leads each deal with a savings statement carrying both figures ("Save £1.08 in Asda, 52% Cheaper"), a product image, then the retailer price rows cheapest-first. Price and saving dominate; provenance is secondary.
- **Baymard's product-list research** is blunt about two things this page gets wrong: grocery items need both the pack price and the unit price visible (67% of sites fail this), and a filtered list needs an applied-filters overview above the results (20% omit it). It also finds horizontal filter toolbars underperform when there are several filter types.
- **Broshura.bg**, the Bulgarian incumbent, leads with category buttons in the header and offer cards built around a ~150px image with the discount badge and struck-through original price.
- Mobile convention across all three: a horizontally scrolling category chip bar, filters behind a sheet.

## Goals / Non-Goals

**Goals**
- Make "what is this product" answerable at a glance, and "is this saving worth it" answerable without arithmetic.
- Make a list of hundreds of groups navigable in a few taps.
- A view a user reaches should be a view they can send to someone.

**Non-Goals**
- Redesigning `/deals`. It gets translated strings so the shell is coherent, nothing more.
- An i18n framework. The interface is Bulgarian; a language switch was considered and declined.
- Dev-only QA surfaces under `/dev`. `app/pages/dev/crops.vue` is a leftover of the archived `add-leaflet-product-image-crops` and is not user-facing, so the Bulgarian-interface requirement is not read as covering it. It can be deleted independently of this change.
- Server-side filtering or pagination. The snapshot is one payload and filtering it client-side is fast enough once the per-card `Map` is fixed.
- Shopping lists, price history, or accounts.

## Decisions

### One hero image per card, not one per retailer row

Per-row thumbnails are more informative in principle — Lidl's yoghurt genuinely is a different product from Kaufland's — but three images per card across a 24-card batch is both visually noisy and expensive, and it reintroduces the flatness the redesign is meant to remove. Trolley shows one image per deal for the same reason.

The resolution order prefers a clean product photograph over a leaflet crop, and the cheapest entry over the others:

1. cheapest entry with a direct image URL, 2. any entry with one, 3. cheapest entry with a crop, 4. any entry with a crop, 5. placeholder tile.

What that resolves to today, now that `replace-lidl-leaflet-with-site-api` has landed: Kaufland and the Lidl product listing publish `imageUrl`, Billa publishes `imageCrop`, and the Lidl XLSX price list publishes neither. So steps 1–2 win in any group containing a Kaufland or Lidl listing offer — including when Billa is the cheapest entry, which is the intended trade of a clean product photograph against showing the cheapest retailer's own artwork. Step 5 is reached only by a group whose every entry comes from the Lidl price list, which makes the placeholder a real but narrow path that has to be tested deliberately rather than encountered.

Per-retailer imagery moves to the details view, where the user has already signalled they want to compare specifics.

### Source links and EANs move into the details view

This contradicts two shipped requirements that place them on every comparison entry, so it is handled as a spec modification rather than a silent redesign. The reasoning: those two fields were added to a card that was already all text, and they are the least-scanned things on it. Rendering a URL and a 13-digit barcode at the same weight as the product name is a direct cause of "not obvious what the products are". The capability is preserved — the fields remain reachable without leaving the page — but they stop competing with the price.

### Filter state is initialized from the URL on the client only

`/` is served with `isr: 1800`. Reading `route.query` during server rendering would fragment that cache across every distinct query string and invite hydration mismatches. So server rendering always produces the default, unfiltered view, and the client applies the URL state after mount.

The cost is a brief flash of the unfiltered list when opening a shared link. That is the right trade against fragmenting the cache of the site's only ISR route, but it is a real, visible artifact and should not be discovered in production.

Related: filter changes use `router.replace` so the history does not fill with intermediate states, while opening the details view uses `router.push` — so Back closes the details view rather than discarding the user's filters.

### The offer lookup is provided, not passed

`PriceComparisonCard` currently builds `new Map(props.offers.map(...))` inside a `computed`, per card instance. At ~5000 offers and 24 cards that is ~120k insertions per batch, repeated on every batch growth.

Hoisting it to the page is the obvious fix; using `provide`/`inject` rather than a prop is the less obvious part. The details view needs the same map but is mounted at page level, outside the card tree, so a prop would mean threading the same object down two separate paths.

A search index is built in the same pass, mapping each group key to a pre-lowercased blob of its label plus its offers' names and brands. Searching product names and brands — not just the generic type label — is what makes search useful, and precomputing keeps filtering at O(number of groups) instead of O(groups × entries) on every keystroke.

### Savings are stated twice, in both units

A percentage alone is misleading on cheap goods (40% off a €0.60 item) and an absolute figure alone is misleading on expensive ones. Both come straight from the existing entries — the absolute per-unit delta is the difference between the most expensive and cheapest entries' unit prices — so no schema change is needed.

### Discrete savings thresholds instead of a slider

Chips at 10%, 20%, and 30% are easier to hit on touch and match how people actually think about this ("at least a fifth off"), where a continuous slider invites fiddling for a precision the underlying data does not support.

`replace-lidl-leaflet-with-site-api` flagged a concern against this filter: the Lidl listing publishes `discountPercentage: 0` when it cannot quantify a discount label, so 0 there means "unquantified" rather than "no discount". It does not reach this filter. Both the threshold and the "biggest savings" sort read `ComparisonGroup.savingsPercentage`, which `buildComparisonGroups` derives from the spread between the group's highest and lowest per-unit price and never from any offer's own `discountPercentage`. A Lidl offer with an unquantified discount still carries a correct price, so it still produces a correct saving. Recorded here so the open question is closed rather than rediscovered.

### Department counts are computed after search, not before

A chip advertising a count that the current search would reduce to zero is worse than no count. Counts are therefore derived from the search-filtered set, and departments with a zero count — including the catch-all — are hidden rather than shown as dead ends.

## Risks / Trade-offs

- **The spec conflict on source links and EANs is the sharpest edge in this change.** Two existing requirements are explicit about placement. They are modified deliberately here; if the modification is rejected, the card must keep both fields and the decluttering benefit is largely lost.
- **Shared-link flash.** The client-only URL initialization means a shared filtered link renders unfiltered for one frame. Accepted in exchange for not fragmenting the ISR cache.
- **The details view depends on data that arrives asynchronously.** It needs the offer lookup, which only exists once `useFetch` resolves. It must be guarded on the snapshot's presence rather than assuming injection is populated at mount, or a direct load of a details URL will error.
- **Sticky toolbar plus a chip bar eats vertical space on small screens.** Mitigated by collapsing everything except search behind a filter sheet below the `sm` breakpoint, while keeping the applied-filters row visible so a short list is always explained.
- **Existing landing-page tests will need their selectors rewritten.** They assert against the current markup, and the redesign changes essentially all of it. Their *behaviour* assertions (empty state, search filtering, batch growth) must survive; only the selectors should change.
- **Graceful degradation is assumed, not free.** If `add-product-departments` has not landed, the chip bar must be omitted rather than rendering a single catch-all chip. That path needs to be exercised, not just reasoned about.
- **The details view renders retailer-authored text.** Per-offer `warnings` are written by the ingestion sources and, for the Lidl listing, quote the retailer's own discount label back to the reader. They are diagnostics being promoted to user-facing copy, so they must be rendered as text and kept visually subordinate to the entry they belong to.

## Open Questions

- Should the details view be a route (`/compare/<groupKey>`) rather than a query parameter on the landing route? A route is better for sharing and indexing, but multiplies the ISR surface and pulls `/deals`-style page scaffolding into this change. Query parameter now; revisit if the details view earns its own traffic.
- Is "biggest savings" still the right default sort once departments exist? It surfaces whatever has the widest per-unit spread, which correlates with extraction noise as much as with genuine bargains. Worth revisiting with real usage.
