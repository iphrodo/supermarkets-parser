## Why

The comparison landing page shows every published group in one flat grid, with no way to narrow by kind of product. With hundreds of groups, a user looking for dairy has to scroll past detergent and beer to find it. Category navigation is the standard answer, and it is the single largest fix for "too many products, inconvenient to use" — but the data to build it does not exist.

`ProductType` carries only `id`, `labelBg`, `labelEn`, and `unitBase`, so a comparison group has no notion of which aisle it belongs to. The per-offer `category` field cannot substitute: it is whatever each source happened to publish — a block heading for Kaufland, a raw numeric category code for the Lidl price list, the retailer's own taxonomy name for the Lidl product listing, and a model's guess for Billa. No two of those are drawn from the same vocabulary, so the field is not comparable across retailers, and a group's offers routinely disagree about it.

The Lidl product listing is the one source that publishes something taxonomy-shaped: `keyfacts.wonCategoryPrimaryPath` carries a stable numeric top-level department id, already used by that source to filter food from non-food. It is not a foundation to build on — it resolves to two buckets (`17` food, `10` drinks) on one of three retailers, so it can neither classify a group nor be reconciled with what the other sources publish.

## What Changes

- A fixed set of supermarket departments is defined in code as a closed enum with Bulgarian labels: twelve real departments plus a catch-all.
- The existing product-type classification is extended so that when the model proposes a new canonical type, it also picks that type's department from the fixed list. Types already in the vocabulary are unaffected by this path — a reused type inherits the department it already has.
- Types persisted before departments existed are backfilled during a subsequent scheduled sync, at the **vocabulary** level. This is the only workable route: type assignments are cached forever per `productKey`, so products classified in earlier weeks will never be re-classified, and backfilling per-product would therefore reach almost nothing.
- Each published comparison group carries its type's department, so the UI can group, count, and filter by it.

The taxonomy is deliberately closed. The product-type vocabulary is allowed to grow because the model proposing "кисело мляко" as a new type is the feature; departments are navigation, and a navigation bar that grows a new tab whenever the model invents one is not navigation. A value outside the set is coerced to the catch-all rather than persisted.

Nothing in this change is user-visible on its own — it supplies the data that `redesign-comparison-landing` renders.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `price-comparison`: canonical product types gain a department drawn from a fixed, closed taxonomy; the taxonomy is defined in code rather than proposed by the model; types persisted before departments existed acquire one without re-classifying their products; and every published comparison group carries its type's department.

## Impact

- `shared/types/department.ts` (new): the `DepartmentId` enum, Bulgarian labels, display order, and icons. Shared rather than server-only because the server classifies and the client renders.
- `server/utils/kv.ts`: `ProductType` gains an optional `department`, kept optional so vocabulary entries written before this change stay readable.
- `server/utils/product-type.ts`: `newType` gains a `department` in both the response schema and the prompt; an out-of-enum value is coerced to the catch-all rather than dropping the type, since a bad department should never cost a comparison group.
- `server/utils/product-type-department.ts` (new): the vocabulary backfill, run from inside `runDailySync` so it is idempotent, self-healing, and needs no new deploy surface or manual script.
- `server/utils/comparison.ts`: one line — the published group carries `type.department`.
- `shared/types/comparison.ts`: `ComparisonGroup` gains `department`.
