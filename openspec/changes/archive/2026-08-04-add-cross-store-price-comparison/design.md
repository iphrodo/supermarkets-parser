## Context

Four ingestion sources produce `Offer` records with very different field quality (see the four `*-offer-ingestion` specs). For cross-store comparison the relevant asymmetry is:

- `ean`: Kaufland only (parsed from the product image URL). Lidl's XLSX has a `Код на продукта`, but it is a Lidl-internal code, not a GTIN, and is already discarded after intra-source dedup.
- `unitText`: reliable for Kaufland ("3 л/ 1455 г") and Lidl XLSX ("Нетно количество"), frequently empty for the two vision sources.
- `category`: three mutually incomparable vocabularies (Kaufland's Bulgarian block headings, Lidl's numeric category codes, the vision sources' free-text guesses).
- `name`: Bulgarian, present everywhere, and — for the vision sources — confidence-gated at ingestion, so what survives is reasonably trustworthy.

The only field with usable cross-source coverage is therefore `name`, which is exactly the field a language model is good at and a hash function is not. `computeProductKey` in `server/utils/normalize.ts` is deliberately retailer-scoped for non-EAN offers, so today there is no cross-store product identity at all — by design, not by omission.

## Goals / Non-Goals

**Goals:**
- Group similar products across retailers automatically, with no per-product human curation.
- Compare on a fair basis: price per kilogram / litre / piece, with promotional mechanics folded in.
- Keep the runtime cost of classification near zero for products already seen in an earlier week.
- Never let comparison logic degrade the existing catalog: a failure here loses comparisons, not the snapshot.

**Non-Goals:**
- Exact SKU matching across retailers (rejected: too few same-week overlaps to be useful; can be layered inside a group later).
- A curated category taxonomy maintained by hand.
- Historical price tracking, or judging whether a price is good relative to previous weeks.
- Comparing offers whose quantity cannot be determined — they are excluded, not guessed.

## Decisions

### Comparison unit: canonical product type, priced per base unit
Each offer is assigned a canonical product *type* — a generic kind of product with brand and pack size stripped ("пилешко филе", "кисело мляко", "кашкавал от краве мляко") — and compared within that type by price per kg / l / pc.

**Rationale:** the user's question is "where is this kind of thing cheapest this week", not "where is this exact barcode cheapest". Type-level grouping produces useful results every week; SKU-level grouping produces an almost empty page, because promotional calendars across chains rarely collide on the same SKU.

**Alternative considered:** fuzzy string matching of names (token-set / trigram similarity) with no model. Rejected as the primary mechanism — Bulgarian retail names differ lexically far more than semantically ("Филе от пилешко, охладено" vs "Пилешки гърди"), so recall would be poor while precision would still need a semantic check afterwards.

### Classification: model-assigned type from a persisted, growing vocabulary
A vocabulary of `{ id, labelBg, labelEn, unitBase }` types lives in KV. During a sync, offers whose `productKey` is already in the assignment cache are skipped entirely; the rest are sent to the model in batches with the current vocabulary in the prompt, and the model either picks an existing `typeId` or proposes a new type. New types are appended to the vocabulary, all assignments are cached by `productKey`.

**Rationale:** the vocabulary is the stable identity layer that name hashing cannot provide, and it converges — after a few weeks almost every offer hits the cache, so both cost and run-to-run nondeterminism trend to zero. Caching by `productKey` (already date-free and stable across weeks per the `deal-catalog` spec) means a product returning in a later week reuses its type for free.

**Alternative considered:** re-classifying everything each run against a fixed hardcoded taxonomy. Rejected — a fixed taxonomy either stays coarse (useless comparisons) or needs constant hand-maintenance, and full re-classification makes group membership flicker week to week.

The classifier reuses the existing Gemini client (`getVisionClient`) and the same structured-output posture (`responseMimeType: 'application/json'` + `responseSchema`) as the two vision scrapers, adding only a text-only counterpart to `extractStructuredDataFromImage`. Classification carries the same confidence gating as vision extraction: an unconfident assignment yields no type, and the offer simply doesn't participate in comparison.

### Quantity: parse to a base unit, fold in the promotional mechanic
`parseQuantity` maps Bulgarian unit text to `{ unitBase: 'kg' | 'l' | 'pc', baseQuantity }`, handling г/кг/мл/л/бр, decimal commas, multipacks ("4 x 125 г"), and Kaufland's slash-joined multi-unit text ("3 л/ 1455 г", where the volume token wins). Unparseable or empty text yields `null` and excludes the offer from comparison rather than assuming a quantity.

The per-unit price folds in `mechanic`: `buy_1_get_1_free` halves the effective price, `buy_2_get_1_free` takes two thirds. Without this, a 1+1 offer looks identical to a full-price one and the "cheapest" answer is simply wrong.

`loyaltyTier` is deliberately *not* folded in — a Kaufland Card price is not available to every shopper, so it is surfaced on the entry (as it already is on the offer card) rather than silently treated as the price.

### Grouping: one entry per retailer, at least two retailers, outlier-guarded
Within a type, each offer's per-unit price is computed and offers whose `unitBase` disagrees with the type's are dropped. Multiple offers from the same retailer collapse to the cheapest one — necessary because Lidl's price-list and leaflet sources both emit `retailer: 'lidl'` (the same collision `belongsToSource` handles in `sync.ts`), and because one retailer often promotes several products of the same type. Groups with fewer than two distinct retailers are discarded: a single-retailer group is not a comparison.

An entry whose per-unit price exceeds ten times the group median is dropped and recorded in the group's `warnings` — a cheap guard against a vision-source misread (a "0,89" read as "89") inventing an absurd "saving".

Groups are ranked by `savingsPercentage = (max − min) / max`, so the page leads with the biggest real differences.

### Placement: computed at sync time, stored in the snapshot
Comparison building runs inside `runDailySync` after `mergeCatalog`, and its output is written into the same KV snapshot. This preserves the existing architecture — `/api/deals` and both pages remain pure readers of one blob, ISR is unchanged, and no user request ever triggers model calls.

Entries reference offers by `offerKey` and carry only the derived numbers, rather than embedding copies of offers, to avoid inflating a snapshot blob that already holds every offer.

The whole enrichment is wrapped so that any failure (model outage, KV read failure, malformed model output) logs and falls back to the previous snapshot's comparisons, mirroring the per-source carry-forward already used for ingestion failures. Comparison is an enhancement over the catalog; it must never be able to take the catalog down.

## Risks / Trade-offs

- **Type granularity is a judgment call the model makes.** Too coarse ("месо") produces meaningless comparisons; too fine ("пилешко филе охладено био") produces single-retailer groups that get discarded. Mitigation: the prompt fixes the intended granularity with examples, and task 8.1 is an explicit human review of real output, with prompt tuning expected.
- **Vocabulary drift.** Near-duplicate types can accumulate ("кисело мляко" vs "кисело мляко краве") and silently split groups. Mitigation: the full vocabulary is always in the prompt with an instruction to prefer an existing type; a later change can add a merge pass if drift is observed in practice.
- **Missing `unitText` on the vision sources** means a meaningful share of Billa / Lidl-leaflet offers cannot be compared at all. Accepted for this change (excluded, not guessed); improving `unitText` recall is an ingestion-side concern.
- **Vocabulary and assignments are unbounded KV values.** They grow with every distinct product ever seen. Expected to stay small (thousands of entries) for years, but worth watching if the blob approaches Upstash value limits.

## Open Questions

- What minimum group size / savings threshold, if any, is worth hiding? Deferred until real output is reviewed.
- Should pieces-priced groups (`unitBase: 'pc'`) be shown at all, given a "piece" of bread and a "piece" of cake are not comparable within a loose type? Reviewed together with the granularity check in task 8.1.
