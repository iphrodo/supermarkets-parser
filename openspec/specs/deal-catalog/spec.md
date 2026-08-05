# deal-catalog Specification

## Purpose

Defines the shared normalized offer schema, product/offer identity keys, and merge behavior that unifies Kaufland and Lidl offers into one browsable catalog regardless of source.

## Requirements

### Requirement: Normalized offer schema
Every offer in the catalog, regardless of source, SHALL conform to one shared schema using integer cents for all prices, an enum `loyaltyTier`, an enum `mechanic`, nullable fields where data is not always present (`originalPriceEurCents`, `priceBgnCents`, `brand`, `purchaseLimit`, `campaign`, `ean`, `imageUrl`), and required `sourceUrl`, `scrapedAt`, and `warnings` fields.

#### Scenario: Cross-source consistency
- **WHEN** offers from Kaufland, Lidl, and Billa are all present in the catalog
- **THEN** all SHALL expose the same field names and types, differing only in which nullable fields are populated and which are structurally absent (e.g. `productUrl` never exists on Kaufland offers, `imageUrl` never exists on Lidl offers)

#### Scenario: Prices stored as integer cents
- **WHEN** any offer is added to the catalog
- **THEN** its price fields SHALL be integers representing cents, never floating-point currency values

#### Scenario: Kaufland offer carries an image URL
- **WHEN** a Kaufland offer is added to the catalog
- **THEN** it SHALL include an `imageUrl` field, either populated with a URL or null when the source tile had no image

#### Scenario: Lidl offer has no image field
- **WHEN** a Lidl offer is added to the catalog
- **THEN** the resulting record SHALL have no `imageUrl` field (not merely a null one), since Lidl's source data contains no product images

#### Scenario: Billa offer carries OCR-derived uncertainty warnings
- **WHEN** a Billa offer is added to the catalog whose non-critical fields were extracted with lower OCR confidence
- **THEN** it SHALL surface that uncertainty through the shared `warnings` field, using the same mechanism as any other source's warnings, rather than a Billa-specific schema field

### Requirement: Two-level offer identity
The system SHALL compute a `productKey` that is stable across weeks (derived without dates) and an `offerKey` computed as `productKey` plus the offer's `validFrom`.

#### Scenario: Same product, new week
- **WHEN** the same real-world product reappears in a later week's data with a new discount period
- **THEN** it SHALL retain the same `productKey` as before, and SHALL receive a new, distinct `offerKey`

### Requirement: Unit-text normalization before identity hashing
Before computing `productKey`, the system SHALL normalize case, whitespace, and token order of unit/quantity text so that equivalent representations collapse to the same key.

#### Scenario: Reordered unit tokens
- **WHEN** the same item appears with unit text tokens in a different order (e.g. "3 л/ 1455 г" vs "1455 г/ 3 л")
- **THEN** the system SHALL produce identical `productKey` values for both occurrences and treat them as one product

### Requirement: BGN price is optional, not guaranteed
`priceBgnCents` SHALL be nullable and treated as an optional field that may disappear once dual BGN/EUR display is no longer legally required, not as a permanent guarantee.

#### Scenario: BGN display removed from a source
- **WHEN** a source stops displaying a BGN price
- **THEN** the catalog SHALL continue to accept and serve that offer with `priceBgnCents` null, without validation failure

### Requirement: Store/scope model instead of per-offer duplication
The system SHALL represent store/region information as a `scope: 'national' | 'regional'` property, with an optional store reference populated only when `scope` is `'regional'`, rather than duplicating store name and city on every offer record.

#### Scenario: National offer
- **WHEN** an offer's price and availability do not vary by store (as verified for Lidl, and assumed by default for Kaufland pending verification)
- **THEN** the offer SHALL be tagged `scope: 'national'` with no store reference attached

### Requirement: Snapshot carries comparison groups by reference
The published snapshot SHALL include the comparison groups derived from its offers, and those groups SHALL reference offers by `offerKey` rather than embedding copies of offer records.

#### Scenario: Comparison group published alongside offers
- **WHEN** a snapshot containing comparison groups is published
- **THEN** every entry in every group SHALL reference an `offerKey` present in the same snapshot's offer list

#### Scenario: No duplication of offer data
- **WHEN** a comparison entry needs offer details for display (name, retailer badge, validity, source link)
- **THEN** those details SHALL be resolved from the snapshot's offer list rather than stored a second time inside the group

#### Scenario: Snapshot with no comparable products
- **WHEN** no product type in a snapshot has comparable offers from two or more retailers
- **THEN** the snapshot SHALL still be published, carrying an empty set of comparison groups rather than omitting the field
