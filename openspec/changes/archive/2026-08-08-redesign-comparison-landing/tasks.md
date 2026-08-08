## 1. Shared formatting and lookup plumbing

- [x] 1.1 Create `app/utils/format.ts` holding `formatEur`, `formatBgn`, `formatDate`, `UNIT_SUFFIX`, `RETAILER_LABELS`, `MECHANIC_LABELS`, and `LOYALTY_LABELS`, and point `OfferCard.vue` and `PriceComparisonCard.vue` at it — `RETAILER_LABELS` and the cent formatter are currently duplicated verbatim between them.
- [x] 1.2 Create `app/composables/useOffersByKey.ts` exposing a typed `InjectionKey<ComputedRef<Map<string, Offer>>>` with `provideOffersByKey` / `useOffersByKey` helpers.
- [x] 1.3 In `app/pages/index.vue`, build the `offerKey → Offer` map once and provide it. Change `PriceComparisonCard`'s props from `{ group, offers }` to `{ group }` and inject instead — this removes the per-card `Map` rebuild (~120k insertions per batch at current data volumes) and gives the details view the same lookup from outside the card tree.
- [x] 1.4 In the same pass, build a search index mapping each `groupKey` to a pre-lowercased string of the group label plus its offers' names and brands, so filtering stays O(number of groups) per keystroke.



## 2. Filter state and URL

- [x] 2.1 Create `app/composables/useComparisonFilters.ts` owning search text, department, selected retailers, sort key, and minimum-savings threshold, and mapping them to and from the route query as `q`, `d`, `r`, `s`, `min` (plus `g` for the open details view). Omit defaults from the query so an unfiltered URL stays clean.
- [x] 2.2 **Initialize from** `route.query` **on the client only** (`onMounted`), never during SSR. The route is served with `isr: 1800`; reading query parameters during server rendering fragments that cache per query string and risks hydration mismatches. Server rendering always emits the default unfiltered view.
- [x] 2.3 Use `router.replace` for filter changes (so the history does not fill with intermediate states) and `router.push` for opening the details view (so Back closes it and leaves filters intact).
- [x] 2.4 Debounce the search-to-URL write by ~300ms while updating local state immediately.
- [x] 2.5 Apply the filters in `index.vue`: search over the index from 1.4; department equality; retailer multi-select with OR semantics across a group's entries; minimum savings; and the sort key. Keep feeding the result to `useIncrementalList` so changing any filter resets the visible batch.



## 3. Toolbar

- [x] 3.1 Create `app/components/comparison/ComparisonToolbar.vue`, sticky below the nav, with a search input, a sort select (`Най-голяма отстъпка` / `Най-ниска цена за единица` / `По име`), retailer multi-select chips, and discrete minimum-savings chips (`10% +`, `20% +`, `30% +`).
- [x] 3.2 Add the applied-filters overview: one removable chip per active filter plus `Изчисти всички`. This is what makes a short result list self-explanatory instead of looking broken.
- [x] 3.3 Show a result count (`Показани N от M продукта`), using the correct Bulgarian singular/plural form.
- [x] 3.4 Below the `sm` breakpoint, keep search inline and collapse the rest behind a `Филтри` button opening a bottom sheet, while keeping the applied-filters row visible at all widths.



## 4. Department navigation

- [x] 4.1 Create `app/components/comparison/DepartmentChips.vue` — a horizontally scrolling chip row (`overflow-x-auto snap-x`, scrollbar hidden) with a leading `Всички (M)` chip.
- [x] 4.2 Compute each chip's count from the **search-filtered** set, so a chip never advertises a count the current search would reduce to zero.
- [x] 4.3 Hide zero-count departments, including the catch-all. Selecting the active chip clears the department filter.
- [x] 4.4 Omit the chip bar entirely when no group carries a department, so the page degrades cleanly if `add-product-departments` is not deployed.



## 5. Card redesign

- [x] 5.1 Create `app/utils/hero-image.ts` — a pure function resolving a group's hero image in order: cheapest entry with a direct image URL; any entry with one; cheapest entry with a crop; any entry with a crop; otherwise none (placeholder).
- [x] 5.2 Rewrite `PriceComparisonCard.vue` as an image column (`h-24 w-24 sm:h-28 sm:w-28`, `shrink-0`) rendering `ProductThumb`, beside a content column.
- [x] 5.3 Make `labelBg` the card heading with `line-clamp-2`.
- [x] 5.4 Render the savings badge with **both** figures — percentage and absolute per-unit amount (`Спести 32% · 1.08 €/кг`). The absolute delta is the difference between the most expensive and cheapest entries' unit prices; no schema change is needed.
- [x] 5.5 Establish the price hierarchy: the cheapest per-unit price is the largest type on the card with its retailer beside it; the pack price sits beneath it in muted small text.
- [x] 5.6 Render the remaining retailers as compact rows, cheapest-first (entries already arrive sorted), each showing its unit price and its difference from the cheapest.
- [x] 5.7 Make the whole card activate the details view for its group, and remove the per-row source links and EAN from the card — they move to the details view under task 6.



## 6. Details view

- [x] 6.1 Create `app/components/comparison/ComparisonDetailsModal.vue`, driven by the `g` query parameter, teleported to `body`, with `role="dialog" aria-modal="true"`, Esc to close, a focus trap, and body scroll lock.
- [x] 6.2 For each entry render its own `ProductThumb`, retailer, brand, full product name, pack size, EAN when non-null, validity dates, promotional mechanic and loyalty badges, **struck-through original price when** `originalPriceEurCents` **is non-null**, BGN price when present, pack and unit price, and a source link opening in a new tab. The null original price is the common case for the Lidl listing, not an edge — leave no empty placeholder or stray separator behind it.
- [x] 6.3 Render the group's `warnings` in a muted block — they are produced by the comparison builder today and displayed nowhere.
- [x] 6.3a Render each entry's own `offer.warnings` with that entry, muted and visually subordinate to it, omitting the area entirely when the array is empty. The Lidl listing populates these for unquantifiable discount labels and Lidl Plus prices, so they are frequent and currently invisible.
- [x] 6.4 Guard the modal on the snapshot having resolved rather than assuming the injected lookup is populated at mount, so opening a details URL directly does not error.



## 7. Bulgarian interface

- [x] 7.1 `app/app.vue`: `Compare prices` → `Сравнение на цени`; `All offers` → `Всички оферти`.
- [x] 7.2 `app/pages/index.vue`: heading → `Сравнете цените в магазините`; `Snapshot last updated` → `Обновено на`; empty state → `В момента няма продукт с оферта в два или повече магазина.`; `Loading more comparisons…` → `Зареждане…`; `You've reached the end of the list.` → `Това е краят на списъка.`
- [x] 7.3 `PriceComparisonCard.vue` and the new comparison components: `Save up to X%` → `Спести до X%`; `Cheapest` → `Най-евтино`; `Source` → `Източник`.
- [x] 7.4 `deals.vue`, `DealsFilterBar.vue`, `OfferCard.vue` — strings only, no redesign: `This week's deals` → `Оферти тази седмица`; `Retailer` / `All retailers` → `Магазин` / `Всички магазини`; `Category` / `All categories` → `Категория` / `Всички категории`; `Max price (€)` → `Макс. цена (€)`; `No offers match these filters yet.` → `Няма оферти по тези филтри.`; `Valid until` → `Валидна до`; `1+1 free` / `2+1 free` → `1+1 безплатно` / `2+1 безплатно`; `Source` → `Източник`.



## 8. Tests

- [x] 8.1 Update the existing `app/pages/__tests__/index-comparison-*.test.ts` for the new markup. Their behavioural assertions (empty state, search filtering, group rendering) must survive; only selectors should change.
- [x] 8.2 `index-comparison-departments.test.ts` (new): chips render with counts derived from the search-filtered set; selecting one narrows the grid; zero-count departments are hidden; the bar is omitted when no group has a department.
- [x] 8.3 `index-comparison-retailer-filter.test.ts` (new): multi-select uses OR semantics across a group's entries.
- [x] 8.4 `index-comparison-min-savings.test.ts` (new).
- [x] 8.5 `index-comparison-url-state.test.ts` (new): filter changes write to the query; a page mounted with a pre-set query restores that state after hydration; clear-all empties the query; defaults are absent from the URL.
- [x] 8.6 `index-comparison-details-modal.test.ts` (new): `g` opens the modal; per-entry EAN, validity, and source link render; the group's warnings render; an entry's own warnings render with that entry and an entry with none renders no warnings area; an offer with `originalPriceEurCents: null` renders no struck-through price; Esc closes it.
- [x] 8.7 Rewrite `app/components/__tests__/PriceComparisonCard.test.ts` for the injected lookup, and assert the hero-image fallback chain, the dual savings badge, cheapest-first ordering, and the Bulgarian strings.
- [x] 8.8 `app/utils/__tests__/hero-image.test.ts` (new, pure): all five branches of the resolution order.
- [x] 8.9 `ComparisonToolbar.test.ts` and `DepartmentChips.test.ts` (new).
- [x] 8.10 Update `stories/PriceComparisonCard.stories.ts` for the new props, and add stories for the toolbar, chip bar, details modal, and a card with no image. Run the a11y addon against the modal.
- [x] 8.11 Add a `makeOffersByKey(offers)` helper to `app/pages/__tests__/fixtures.ts`.



## 9. Verification

- [x] 9.1 `--project unit` 167 passed, `--project app` 54 passed, `npm run build` clean, `nuxt typecheck` clean. `--project storybook` **cannot run**: it fails on importing `@storybook/addon-vitest`'s setup file (`aria-query` does not export `elementRoles`). Confirmed pre-existing on a clean tree via `git stash`, so it is not this change's regression — but it does mean the new stories are unverified by test.
- [x] 9.2 Loaded `/` against the live snapshot: 75 groups, all interface strings Bulgarian, and all 24 cards of the first batch resolved a hero image (Lidl `imgproxy-retcat.assets.schwarz` photos and Kaufland `kaufland.media.schwarz`) with zero placeholder tiles — which is the corrected image-coverage claim holding in practice.
- [x] 9.3 Exercise search, sort, department, retailer, and minimum-savings filters: the URL updates, the result count matches, and each change resets the visible batch to the first 24.
- [x] 9.4 Copy a filtered URL into a fresh tab and confirm the state is restored; press Back from an open details view and confirm it closes with the filters intact.
- [x] 9.5 Covered by `index-comparison-details-modal.test.ts`, which mounts at `/?g=<key>` and asserts the dialog renders. Confirmed against the running app that the SSR response deliberately carries no dialog: `g` is client-only state, so the modal appears after hydration. That is decision 2.2 working, not a failure.
- [x] 9.6 Scroll to trigger `useIncrementalList` twice and confirm newly rendered cards load their images lazily rather than all at once.
- [x] 9.7 At a 375px viewport: the chip bar scrolls horizontally, the filter sheet opens and closes, the sticky toolbar does not cover the first card, and the applied-filters row stays visible.
- [x] 9.8 Check every new surface in dark mode — placeholder tiles and the modal overlay are the easiest to get wrong.
- [x] 9.9 `/deals` returns 200 and is fully Bulgarian; the only English left in the response is the `buy_1_get_1_free` enum inside the JSON payload, not rendered text.

- [~] 9.10 Departments half **verified against real data**: the deployed vocabulary carries no departments yet, every group coerces to the catch-all, and the chip bar is absent from the rendered page. The placeholder half is covered by unit tests and the `NoImage` story but not yet seen in the real app — no published group is currently all-Lidl-price-list.

