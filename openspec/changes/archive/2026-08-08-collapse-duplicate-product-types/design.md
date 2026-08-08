## Context

See proposal.md — Why. What matters for the approach is one measurement: of the 88 suffixed type ids in the live vocabulary, **zero** exist because two different labels slugified the same. Every one has a base sibling with an identical `labelBg`. So the suffix branch in `uniqueTypeId` has, in production, only ever produced duplicates.

Two constraints shape everything below:

- **Assignments are cached forever per `productKey`.** A product classified in an earlier week is never re-classified. So a repair cannot work by "letting the next sync sort it out" — it has to rewrite the assignment map directly, exactly as the department backfill had to work at vocabulary level rather than per product.
- **`add-product-departments` is implemented but not archived.** It modifies the `Automatic canonical product-type assignment` requirement. This change deliberately touches no existing requirement, so the two deltas cannot conflict and either can archive first.

## Goals / Non-Goals

**Goals**
- Make "the vocabulary contains no indistinguishable types" an invariant the system maintains, not an instruction the model is asked to follow.
- Repair the existing duplicates without spending a model call or re-classifying a product.
- Keep the repair re-runnable: running it on already-clean data must be a no-op, not a slow no-op.

**Non-Goals**
- Near-duplicate detection. `свинско месо` against `свинско месо котлет`, or a singular against a plural, needs a judgement the exact-label case does not — and a wrong merge deletes a distinct product type silently. Out of scope by design, not by omission.
- Re-classifying anything. The merge only moves assignments between existing type ids.
- Preventing the model from *proposing* a duplicate. Cheaper to catch the proposal than to lengthen the prompt, and catching it is deterministic where prompting is not.
- Cleaning up the id namespace. A surviving type keeps whatever id it has, suffix included.

## Decisions

### Identity is `(normalized label, unitBase)`, not the slug

The current code keys on the slug, which is what produces the bug: a slug collision is read as "pick another id" when it usually means "this type already exists". Keying on the label directly makes the intent explicit and leaves the slug doing only what a slug should — producing a URL-safe id.

Normalization is lowercase + trimmed + collapsed internal whitespace. Deliberately not accent- or stem-stripping: that starts approximating meaning, which is the non-goal above.

`unitBase` is part of the key because a group is built from offers sharing a base unit, and `buildComparisons` already drops an offer whose base unit disagrees with its type. Merging `сладолед` (kg) into `сладолед` (l) would produce a type whose own offers are then excluded from it — a duplicate replaced by a broken group.

### The suffix stays, and becomes reachable only by the case it was written for

Once a label match returns the existing id, the suffix branch can only be hit when two *different* labels slugify identically. That case is real (punctuation, casing) and still needs a unique id. Keeping it costs nothing and removing it would trade a duplicate-type bug for an id-collision bug.

### The merge is a pure function, run from `runDailySync`

`mergeDuplicateTypes(vocabulary, assignments)` returns a new vocabulary and a new assignment map. No I/O, no model, no clock — so the interesting cases (which type survives, what happens to a cluster of four) are unit-testable without stubbing anything.

It runs from `runDailySync` beside the department backfill rather than as a script, for the same reasons that one does: no new deploy surface, no manual step to forget, and it self-heals if a future bug reintroduces duplicates. It is idempotent by construction — with no duplicate labels it returns its inputs unchanged, after a single grouping pass and zero writes.

Alternative considered: a one-off migration script. Rejected — it would need running by hand exactly once, and would leave nothing in place if duplicates ever reappeared. The sync-resident version costs one pass over ~500 entries per run.

### The surviving type is the one with the most products assigned to it

Ties break on the shorter id, then lexicographically, so the result is deterministic regardless of vocabulary order.

Most-assigned is the right tiebreak because it minimises how many assignments have to be rewritten (`сладолед`=48 against `сладолед-7`=3), and because the heavily-used id is the one likelier to appear in an already-shared URL. Choosing "the unsuffixed one" would usually agree, but not always, and it encodes an assumption about id shape that the data does not guarantee.

Since every cluster agrees on `unitBase` and `department`, the surviving entry needs no field merging — it is kept whole. The merge asserts that agreement rather than assuming it: a cluster that disagrees on `department` takes the survivor's, which is the same rule `toDepartmentId` applies everywhere else.

### Ordering inside the sync: merge before the department backfill

The merge only removes entries, so running it first means the backfill sees a smaller vocabulary and never spends a model call on a type that is about to disappear. The reverse order would work but would pay to classify entries it then discards.

## Risks / Trade-offs

- **A `groupKey` disappears.** A comparison group keyed on a merged-away type stops existing, so a shared details URL pointing at it no longer resolves. → The landing page already treats an unknown `g` as "no details view" and leaves the list usable, so this degrades rather than errors. Accepted: the alternative is keeping a duplicate group alive purely to preserve a link.
- **Merging changes published savings.** Combining two halves of a product kind can raise or lower the group's saving, because the cheapest and most expensive entries are now drawn from a larger set. → This is the correction, not a side effect: the split groups were each showing a saving computed over a subset of the retailers actually offering that product.
- **Assignment rewriting is the destructive step.** A bug here silently points products at a type that no longer exists, and they would then vanish from comparisons with no error — the exact failure mode the recent vocabulary loss produced. → The function is pure and unit-tested on the cluster shapes present in the live data, and it is written to never emit an assignment whose target is absent from the vocabulary it returns. A test asserts that invariant directly.
- **Exact-label matching leaves most near-duplicates in place.** 57 clusters collapse; pairs like `свинско месо` / `свинско месо котлет` remain. → Deliberate. The measured harm — two duplicate cards on the landing page — comes from exact duplicates, and this removes it without risking a wrong merge.

## Migration Plan

1. Merge and deploy. No schema change; `ProductType`, `ProductTypeAssignments`, and `ComparisonGroup` are untouched.
2. The first sync after deploy collapses 145 types into 57 and rewrites the assignments pointing at the removed ones. Expect the published group count to drop by roughly the number of duplicated labels that were reaching publication (2 known), with those groups gaining retailers.
3. Every subsequent sync finds nothing to merge and does nothing.
4. Rollback: revert the commit. The vocabulary stays merged — the merge is not reversible from the data it leaves behind, and does not need to be: a merged vocabulary is valid input for the pre-change code, which simply stops maintaining the invariant.
