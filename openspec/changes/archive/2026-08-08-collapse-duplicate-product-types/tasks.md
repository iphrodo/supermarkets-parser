## 1. Type identity

- [x] 1.1 In `server/utils/product-type.ts`, add a `normalizeLabel(labelBg)` helper — lowercase, trim, collapse internal whitespace. Deliberately no accent stripping or stemming: that starts approximating meaning, which is a non-goal.
- [x] 1.2 Replace `uniqueTypeId(labelBg, vocabulary)` with `resolveTypeId(labelBg, unitBase, vocabulary)`, returning either an existing type's id (when normalized label **and** `unitBase` both match) or a fresh slug. Keep the `-2`/`-3` suffix loop for the case it was written for — two genuinely different labels slugifying the same — which is now the only way to reach it.
- [x] 1.3 In `classifyOffers`'s `newType` branch, append to the vocabulary **only** when `resolveTypeId` returned a new id; otherwise assign the offer to the returned existing id and leave the vocabulary alone. The reuse-existing-`typeId` branch is untouched.

## 2. Merging existing duplicates

- [x] 2.1 Create `server/utils/product-type-merge.ts` with `mergeDuplicateTypes(vocabulary, assignments)` — pure, no I/O, no model, no clock — returning `{ vocabulary, assignments, merged }`.
- [x] 2.2 Cluster types by `(normalizeLabel(labelBg), unitBase)`. Elect the survivor by most assignments, breaking ties on shorter id then lexicographically, so the result does not depend on vocabulary order.
- [x] 2.3 Remap every assignment pointing at a removed type onto its cluster's survivor, and drop the removed entries from the vocabulary.
- [x] 2.4 Return the inputs unchanged when no cluster has more than one member, so the merge is a single grouping pass and zero writes on already-clean data.
- [x] 2.5 Guarantee the output invariant: never emit an assignment whose `typeId` is absent from the returned vocabulary.

## 3. Wiring

- [x] 3.1 Call `mergeDuplicateTypes` from `runDailySync` **before** `backfillDepartments`, so the backfill never spends a model call on a type about to be removed.
- [x] 3.2 Persist the merged vocabulary and assignments only when something actually merged, via injected writers matching the `ClassifyOffersDeps` shape so tests never touch KV.
- [x] 3.3 Keep it inside the existing try/catch that degrades to the previously published comparison groups — a merge failure must not block publication.
- [x] 3.4 Feed the merged vocabulary and assignments into `buildComparisons`, so the collapse reaches the snapshot on the same run.

## 4. Tests

- [x] 4.1 `server/utils/__tests__/product-type-merge.test.ts` (new): a two-type cluster collapses and its assignments are remapped; a four-type cluster (as `свинско месо` is in live data) collapses to one; the most-assigned type survives; ties break deterministically.
- [x] 4.2 Same file: types sharing a label but differing in `unitBase` are **not** merged; labels that merely resemble each other are not merged; clean input is returned unchanged.
- [x] 4.3 Same file: assert the output invariant — every returned assignment's `typeId` exists in the returned vocabulary.
- [x] 4.4 Extend `product-type` tests: a proposed `newType` duplicating an existing label+`unitBase` reuses it and does not grow the vocabulary; the same label with a different `unitBase` does create a second type; two different labels that slugify identically still get distinct suffixed ids.
- [x] 4.5 Extend the `sync` tests: comparisons are built from the merged vocabulary, and a failing merge still publishes. Inject the merge in every `runDailySync` test.
- [x] 4.6 Covered end-to-end in `sync.test.ts` instead of `comparison.test.ts`: the merge and `buildComparisons` are exercised together, so the test asserts the thing that matters — two single-retailer types collapse into one group covering both retailers — rather than re-asserting grouping on hand-merged input.

## 5. Verification

- [x] 5.1 `--project unit` 182 passed, `--project app` 54 passed, `nuxt typecheck` clean, `npm run build` clean.
- [x] 5.2 Dry run against live data: 494 → 406 types, exactly 88 removed (the 88 suffixed ids, all of them), 105 assignments rewritten onto a survivor, **0 dropped**, **0 left pointing at a removed type**, **0 duplicate (label, unitBase) pairs remaining**.
- [x] 5.3 Sync run 2026-08-08 12:43 UTC logged `Merged 88 duplicate product type(s): 552 -> 464 types, 1564 -> 1564 assignments` — the vocabulary had grown past the dry-run figure because classification runs first, and the prevention held: those 58 newly classified types added no new duplicates. Vocabulary now has 464 types and **464 distinct labels**.
- [x] 5.4 Both appear exactly once and each now carries all three retailers: `кисело-мляко` [dairy-eggs] kaufland+billa+lidl at 35%, `сладолед` [frozen] billa+kaufland+lidl at 32%. Zero published groups share a label. 91 groups published.
- [x] 5.5 Second sync logged no merge line at all — nothing to do, nothing written — and the vocabulary was unchanged at 464 types / 464 distinct labels.
