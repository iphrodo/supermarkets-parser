## 1. Shared types

- [x] 1.1 Add optional `department?: DepartmentId` to `Offer` in `shared/types/offer.ts`, with `import type { DepartmentId } from './department'`, and a comment explaining absence is meaningful (mirrors `ProductType.department?`).

## 2. Department resolver

- [x] 2.1 In `server/utils/comparison.ts`, add exported `DepartmentResolver` interface (`forTypeId`, `forProductKey`) and `createDepartmentResolver(vocabulary, assignments)` factory, importing `CATCH_ALL_DEPARTMENT` alongside the existing `toDepartmentId` import.
- [x] 2.2 Update `buildComparisons` to build `resolveDepartment = createDepartmentResolver(vocabulary, assignments)` and use `resolveDepartment.forTypeId(typeId)` in place of the inline `toDepartmentId(type.department)` at the group-construction site. Leave the existing local `typesById` in place for `labelBg`/`unitBase` lookups.
- [x] 2.3 Add `describe('createDepartmentResolver', ...)` tests in `server/utils/__tests__/comparison.test.ts`: resolves a known type's department; catch-all for an unknown `typeId`; catch-all when the matched type's `department` is undefined/invalid; `forProductKey` resolves through `assignments`; catch-all for an unmapped `productKey`.
- [x] 2.4 Run the existing `buildComparisons` tests unmodified and confirm they still pass, as the regression check that the refactor is behavior-preserving.

## 3. Snapshot publication

- [x] 3.1 In `server/utils/sync.ts`, import `createDepartmentResolver` from `./comparison` and `CATCH_ALL_DEPARTMENT`/`type DepartmentId` from `../../shared/types/department`.
- [x] 3.2 Add a local `previousDepartmentsByOfferKey(previous: DealsSnapshot | null): Map<string, DepartmentId>` helper next to `previousSourceStatus`, keyed by `offerKey`, populated only from previous offers that already carry a `department`.
- [x] 3.3 Extend the existing classify/dedupe/backfill/compare try block to also produce a department-annotated `offers` array: on success, map `merged.offers` through `resolveDepartment.forProductKey(offer.productKey)`; on failure (catch branch), map `merged.offers` through `previousDepartmentsByOfferKey(previous).get(offer.offerKey) ?? CATCH_ALL_DEPARTMENT`.
- [x] 3.4 Change the snapshot-construction object to use the new `offers` variable instead of `merged.offers`.
- [x] 3.5 Add tests in `server/utils/__tests__/sync.test.ts`: published offers carry their resolved department on classification success; an offer whose `offerKey` matches a previous snapshot offer inherits that offer's department when enrichment fails; a brand-new offer with no previous match defaults to the catch-all department when enrichment fails.

## 4. Deals filter UI

- [x] 4.1 In `app/components/DealsFilterBar.vue`, import `DEPARTMENT_ICONS`, `DEPARTMENT_LABELS_BG`, `type DepartmentId` from `../../shared/types/department`; change `DealsFilterValue.category` to `DepartmentId | 'all'` and the `categories` prop to `DepartmentId[]`; render each `<option>` with the department icon and Bulgarian label instead of the raw string.
- [x] 4.2 In `app/pages/deals.vue`, import `DEPARTMENT_ORDER`, `toDepartmentId`, `type DepartmentId`; replace the `categories` computed to derive the set of `toDepartmentId(offer.department)` present among offers, filtered against `DEPARTMENT_ORDER` to preserve canonical order; update the filter predicate to compare `toDepartmentId(offer.department)` against `filter.value.category`.
- [x] 4.3 Widen `makeOffer` in `app/pages/__tests__/fixtures.ts` with an optional `overrides: Partial<Offer>` third parameter (check existing call sites first; this must stay non-breaking).
- [x] 4.4 Add `app/pages/__tests__/deals-department-filter.test.ts`: dropdown lists only departments present in the data, in `DEPARTMENT_ORDER`; selecting a department filters the rendered offers to matches only; an offer with no `department` is treated as the catch-all and doesn't crash the page.
- [x] 4.5 Add `app/components/__tests__/DealsFilterBar.test.ts`: mount test asserting rendered `<option>` text shows the Bulgarian label (and icon) for a given `categories` prop, not a raw id.

## 5. Verification

- [x] 5.1 Run `npx vitest run server/utils/__tests__/comparison.test.ts server/utils/__tests__/sync.test.ts shared/types/__tests__/department.test.ts app/pages/__tests__ app/components/__tests__/DealsFilterBar.test.ts` and confirm all pass.
- [x] 5.2 Run the project's typecheck script and confirm no scraper file or `catalog.ts` needed changes (validates the optional-field decision).
- [x] 5.3 Run the full test suite (`npx vitest run`) to catch any other consumer of `DealsFilterValue` or `.category` missed above.
- [x] 5.4 Run the dev server, open `/deals`, and confirm: the category dropdown shows Bulgarian department labels/icons (not raw strings or bare numbers); selecting a department filters the grid correctly; offers lacking `department` (simulated pre-migration data) surface under "Други" without breaking the page.
