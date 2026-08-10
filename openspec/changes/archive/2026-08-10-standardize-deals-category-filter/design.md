## Context

See proposal.md - Why. The relevant existing pipeline: `server/utils/sync.ts`'s `buildSnapshot` merges all sources' offers, then runs `classifyOffers` → `mergeAndPersistDuplicateTypes` → `backfillDepartments` → `buildComparisons`, all inside one try/catch that degrades to the previous snapshot's `comparisons` on failure (never blocking publication). `buildComparisons` (`server/utils/comparison.ts`) already resolves `productKey → typeId → ProductType.department → toDepartmentId` inline, but only for product types that end up in a published `ComparisonGroup` (2+ retailers). `Offer` has no `department` field today, so that resolution never reaches the `/deals` page.

## Goals / Non-Goals

**Goals:**
- Every published offer carries a resolved `department`, not only offers whose type made it into a comparison group.
- The `/deals` category filter uses the fixed `DepartmentId` taxonomy already defined in `shared/types/department.ts`.
- No new classification cost: reuse the vocabulary/assignments already computed each sync.
- Preserve the existing "degrade gracefully, never block publication" behavior for the new per-offer field.

**Non-Goals:**
- Replacing or removing the raw `Offer.category` field or its display on `OfferCard.vue` — that free-text detail stays as-is.
- Building a Lidl numeric-code → name lookup table, or any second taxonomy.
- Changing anything in the `/` landing page's existing department-chip behavior (`ComparisonGroup.department`), beyond having its resolution logic reused rather than duplicated.

## Decisions

**`Offer.department` is optional (`department?: DepartmentId`), not required.** Scrapers construct `Offer` objects at parse time, before classification runs, and have no access to vocabulary/assignments. A required field would force every scraper and its test fixtures to fabricate a department. This mirrors the existing precedent `ProductType.department?: DepartmentId` (`server/utils/kv.ts`), whose own comment already establishes the pattern: absence is meaningful ("not yet resolved"), and consumers coerce with `toDepartmentId` at the point of use rather than assuming presence. Alternative considered: making it required and populating a placeholder at scrape time — rejected because it would let scrapers assert a department they have no way to know, defeating the point of classification being the single source of truth.

**The productKey/typeId → department join is extracted into one exported resolver in `server/utils/comparison.ts`**, used by both `buildComparisons` (for comparison groups) and the new per-offer annotation step in `sync.ts`. That file already imports `ProductType*` types and `toDepartmentId`, and already contains the logic being extracted (currently private and inlined). A new file was considered and rejected: it would just re-import the same three things for ~15 lines of logic with two call sites, one of which already lives in `comparison.ts`.

**Per-offer department annotation happens once per sync run, inside `buildSnapshot`, not per-request.** The alternative — resolving department lazily on each `/api/deals` read by shipping the vocabulary/assignments to the client or joining server-side per-request — was rejected: it would mean shipping/loading KV data on every page view for a value that only changes on a schedule (Mon/Thu 10:00 Europe/Kyiv, per `server/utils/schedule.ts`), and it would break the existing invariant that `/deals` and `/` only ever read the pre-built snapshot (`deals-browsing-ui` spec's "ISR-served, no live scraping on request" requirement).

**Failure degrades per-offerKey, not as an all-or-nothing fallback.** Comparison groups already degrade to the entire previous array on enrichment failure. Offers, unlike comparisons, are always republished every run (a scraper source can still succeed even when classification fails), so a per-offerKey lookup into the previous snapshot's departments preserves known departments for unchanged offers while safely defaulting any offer with no prior match (new or renamed `offerKey`) to the catch-all — never leaving `department` `undefined` on a freshly published offer.

**Client code always reads `offer.department` through `toDepartmentId()`, never bare.** The cached `deals:snapshot` in Redis predates this field, and the sync schedule means the window before every offer has a real department can be days, not hours (`catch-up-sync.ts` only fires for an already-missed scheduled window, not on every deploy). `toDepartmentId(undefined)` already safely resolves to the catch-all, so this is a zero-cost consistency choice, not new logic.

## Risks / Trade-offs

- **[Risk]** Immediately after deploy, most/all cached offers have no `department`, so the `/deals` filter shows effectively one option ("Други") until the next real sync. → **Mitigation**: this only affects the filter's usefulness, not correctness — the page still renders, offers still show, and `toDepartmentId` coercion prevents any crash. Optionally speed this up operationally by triggering the sync cron endpoint post-deploy; not required by this change.
- **[Risk]** Refactoring `buildComparisons` to call the new resolver could subtly change department output for comparison groups if the extraction isn't behavior-preserving. → **Mitigation**: existing `buildComparisons` tests already assert `department` on resulting groups; running them unmodified after the refactor is the regression check.

## Migration Plan

No data migration script. The field is optional and coercion is total (`toDepartmentId`), so old cached snapshots keep working as-is. The next scheduled sync (`runDailySync` → `buildSnapshot`) republishes every offer with a real resolved department once classification succeeds; no manual backfill is required. Rollback is a plain revert — the added field is additive and ignored by any code that doesn't read it.
