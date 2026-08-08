## 1. Department taxonomy

- [x] 1.1 Create `shared/types/department.ts` exporting `DEPARTMENTS` as a `const` tuple and `DepartmentId` derived from it: `fruit-veg`, `meat`, `fish`, `deli`, `dairy-eggs`, `bakery`, `pantry`, `sweets-snacks`, `frozen`, `drinks`, `alcohol`, `household`, `other`.
- [x] 1.2 Export `DEPARTMENT_LABELS_BG: Record<DepartmentId, string>` — `Плодове и зеленчуци`, `Месо`, `Риба и морски дарове`, `Колбаси и деликатеси`, `Мляко, млечни и яйца`, `Хляб и тестени`, `Основни хранителни`, `Сладки и солени закуски`, `Замразени`, `Безалкохолни напитки`, `Алкохол`, `Домакинство и хигиена`, `Други`.
- [x] 1.3 Export `DEPARTMENT_ORDER` (display order for the UI, with the catch-all last) and `DEPARTMENT_ICONS: Record<DepartmentId, string>`. Keep `other` inside the enum rather than making the field nullable, so `DepartmentId` stays total and `Record<DepartmentId, …>` lookups never need a fallback branch. Also exports `isDepartmentId` / `toDepartmentId`, the single coercion point shared by the classifier and every vocabulary read site.

## 2. Vocabulary schema

- [x] 2.1 In `server/utils/kv.ts`, add `department?: DepartmentId` to `ProductType`. Keep it optional so vocabulary entries written before this change remain readable.
- [x] 2.2 Normalize a missing department to `'other'` at every **consumer** read site (via `toDepartmentId`), rather than leaving `undefined` to leak out. Deliberately not in `readProductTypeVocabulary`: `backfillDepartments` identifies its work by the key being absent, so a normalizing reader would make "not yet backfilled" indistinguishable from "genuinely other" and the backfill would never run.

## 3. Classification

- [x] 3.1 In `server/utils/product-type.ts`, add `department: DepartmentId` to `ClassificationResult['newType']`.
- [x] 3.2 In `CLASSIFICATION_RESPONSE_SCHEMA`, add `department: { type: Type.STRING, enum: [...DEPARTMENTS] }` inside `newType.properties` and add `'department'` to `newType.required`.
- [x] 3.3 In `buildClassificationPrompt`, list the departments as `id — Bulgarian label` pairs and instruct that `department` is the supermarket aisle the type belongs to, exactly one id from the list, with `other` reserved for cases where none genuinely apply.
- [x] 3.4 In `classifyOffers`, validate the returned department against `DEPARTMENTS` and **coerce an unknown value to `'other'` rather than dropping the type** — a bad department must never cost a comparison group. Leave the reuse-existing-`typeId` branch untouched; it inherits the vocabulary entry's department.

## 4. Backfill for existing types

- [x] 4.1 Create `server/utils/product-type-department.ts` with `backfillDepartments(vocabulary, deps)`, following the dependency-injection shape already used by `ClassifyOffersDeps` so it is testable without the model.
- [x] 4.2 Select only vocabulary entries whose department is missing, batch them 40 at a time (matching `classifyOffers`), and send a text-only prompt returning `{ items: [{ index, department }] }` against a schema whose `department` is the closed enum.
- [x] 4.3 Return early with zero model calls when no entry lacks a department, so the backfill is naturally idempotent across every subsequent sync.
- [x] 4.4 Tolerate a failed batch: log it and leave those entries for the next run rather than aborting the whole backfill.
- [x] 4.5 Write the updated vocabulary back to KV — and only when a batch actually produced an assignment, so a run where every batch failed writes nothing.
- [x] 4.6 Call `backfillDepartments` from `runDailySync`, between classification and comparison building, inside the same try/catch that already degrades to the previously published comparison groups — a backfill failure must not block publication. It returns the updated vocabulary, which is what `buildComparisons` is then given, so departments reach the snapshot on the same run they are assigned.

## 5. Comparison groups

- [x] 5.1 Add `department: DepartmentId` to `ComparisonGroup` in `shared/types/comparison.ts`.
- [x] 5.2 In `server/utils/comparison.ts`, set `department: toDepartmentId(type.department)` in the `groups.push({...})` literal (`type` is already in scope) — the shared coercion rather than a local `?? 'other'`, so a vocabulary entry holding a stale or hand-edited department is caught too.

## 6. Tests

- [x] 6.1 `shared/types/__tests__/department.test.ts` (new): every `DepartmentId` has a Bulgarian label and an icon; `DEPARTMENT_ORDER` is a permutation of `DEPARTMENTS` with the catch-all last; `toDepartmentId` coerces an invented value and an absent one.
- [x] 6.2 Extend `product-type` tests: a new type with a valid department is persisted with it; an out-of-enum department is coerced to `other` and the type is still created; the reuse path does not require a department.
- [x] 6.3 `server/utils/__tests__/product-type-department.test.ts` (new): only entries lacking a department are batched; nothing to backfill issues zero model calls; a failing batch leaves the vocabulary intact and retries next run; an all-batches-failed run writes nothing.
- [x] 6.4 Extend the comparison tests: a published group carries its type's department, and a type with no department yields `other`.
- [x] 6.5 Update `app/pages/__tests__/fixtures.ts` so `makeComparisonGroup` includes a department.
- [x] 6.6 Extend the `sync` tests: comparisons are built from the *backfilled* vocabulary, and a failing backfill still publishes. Inject `backfillDepartments` in every `runDailySync` test — the real one calls the model, and with a populated `.env` the suite was reaching the network.

## 7. Verification

- [x] 7.1 Run `npx vitest run --project unit` (167 passed) and `--project app` (22 passed), plus `npm run build` and `tsc --noEmit`. All green.
- [x] 7.2 Live sync run 2026-08-08 12:15–12:17 UTC: all four sources green, 1430 offers, published. Vocabulary went 75 → 494 entries with **0 lacking a department**. Idempotence proved directly rather than inferred: `backfillDepartments` re-run against the real 494-entry vocabulary with a throwing model stub issued **0 model calls and 0 KV writes** and returned the input array unchanged.
- [x] 7.3 Published snapshot carries 89 comparison groups, **0 missing the `department` field**. Distribution is spread across 13 departments (dairy-eggs 14, pantry 13, sweets-snacks 10, alcohol 9, bakery 7, drinks/deli/meat/frozen 6 each, household 5, fish/other 3, fruit-veg 1) — `other` is 3.4% of groups and 6.5% of types, so no collapse into the catch-all.
- [x] 7.4 Spot-checks pass, including the stated example: `кисело мляко` → `dairy-eggs`. The two prompt tie-breakers hold — frozen wins over the food kind (`сладолед`, `панирани пилешки хапки`, `панирани кашкавалени пръчици замразени` → `frozen`, not dairy/meat) and alcohol wins over drinks (`бира`, `вино`, `ракия` → `alcohol`). No keyword confusion: `панер за хляб` → `household` not `bakery`, `прахосмукачка` → `household` while `какаова напитка на прах` → `pantry`. `other` holds car mats, a fire extinguisher, a chainsaw, furniture and pet food — things with no grocery aisle, not a dumping ground.
- [!] 7.5 **Found, out of scope, not fixed:** the vocabulary carries 57 labels held by more than one type (145 types), e.g. four distinct `свинско месо` ids. Two surface as duplicate published groups (`кисело мляко`, `сладолед`). This violates `price-comparison`'s existing *"Type vocabulary is reused, not reinvented"* requirement, not anything this change introduced — but the forced reclassification of 580 products during the KV repair contributed to it. Needs its own change against `price-comparison`.
