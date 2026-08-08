## Why

`price-comparison` already requires that "an existing canonical type SHALL be reused rather than a near-duplicate type being created". The system violates that requirement mechanically, not occasionally.

When the classifier proposes a new type, `uniqueTypeId` slugifies its `labelBg` and, finding the slug taken, mints `<slug>-2`. The case it is guarding against is two genuinely different labels that happen to slugify identically. The case it actually hits is the model proposing a type that already exists — and instead of reusing it, the system creates a second one.

The live vocabulary measured on 2026-08-08 settles which case is real: **88 types carry a numeric suffix, and for every one of them the base sibling holds an identical `labelBg`.** Not one suffixed id exists for the reason the suffix was written. The result is 57 labels held by 145 types — four separate `свинско месо`, three `пуешко месо`, three `прясна салата`. Two of them reach users as duplicate comparison groups on the landing page: `кисело мляко` and `сладолед` each appear twice, splitting one product kind's offers across two cards and understating the saving on both.

All 57 clusters agree internally on `unitBase` and on `department`, so nothing about the duplicates is genuinely distinct.

## What Changes

- A proposed new type whose normalized `labelBg` already exists in the vocabulary with the same `unitBase` is **reused** rather than given a suffixed id. This is the deterministic half of the reuse requirement: the model is asked to prefer reuse, and now the system enforces it where the answer is unambiguous.
- The suffix is kept, but can now only be reached by the case it was written for — a slug collision between two genuinely different labels. A label that differs only in `unitBase` still gets its own type, since merging across base units would compare incompatible quantities.
- A one-off repair merges the existing duplicates: assignments pointing at a redundant type are remapped onto its canonical one, and the redundant vocabulary entries are dropped. The merge is a pure function of the vocabulary and assignments — **no model calls**, so it is cheap, reviewable, and produces the same result every time it is run.
- The repair runs from inside `runDailySync`, like the department backfill, so it is idempotent and needs no deploy surface: once no duplicate labels remain it does nothing.

Not in scope: merging *near*-duplicate labels (`свинско месо` against `свинско месо котлет`). Those need a judgement call the exact-label case does not, and a wrong merge silently destroys a distinct product type. Only exact label matches are collapsed.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `price-comparison`: the existing reuse requirement gains the guarantee that the vocabulary cannot hold two types with the same label and base unit — the case where reuse is unambiguous is now enforced by the system rather than requested of the model — plus a requirement that types already duplicated are merged without re-classifying the products assigned to them.

## Impact

- `server/utils/product-type.ts`: `uniqueTypeId` is replaced by a resolver that returns an existing type's id when the label and base unit match, and only mints a suffixed id for a true slug collision. `classifyOffers`'s `newType` branch assigns to the returned id instead of always appending to the vocabulary.
- `server/utils/product-type-merge.ts` (new): `mergeDuplicateTypes(vocabulary, assignments)`, pure and model-free, returning the collapsed vocabulary plus the remapped assignments.
- `server/utils/sync.ts`: the merge runs alongside the department backfill, inside the same try/catch that already degrades to the previously published comparison groups.
- No schema change: `ProductType`, `ProductTypeAssignments`, and `ComparisonGroup` are untouched.
- User-visible on the next sync: 145 types collapse to 57, and the duplicated `кисело мляко` and `сладолед` cards become one card each carrying the full set of retailers — which is also a correction to the saving each was showing.
- `groupKey` continuity: a group keyed on a *redundant* type id disappears and its offers move to the canonical id's group. Since the landing page's details view is addressed by `groupKey`, a shared link to a merged-away group stops resolving — the URL already tolerates this by leaving the list usable.
