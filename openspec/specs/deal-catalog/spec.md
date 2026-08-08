# deal-catalog Specification

## Purpose

Defines the shared normalized offer schema, product/offer identity keys, and merge behavior that unifies Kaufland and Lidl offers into one browsable catalog regardless of source.

## Requirements

### Requirement: Normalized offer schema
Every offer in the catalog, regardless of source, SHALL conform to one shared schema using integer cents for all prices, an enum `loyaltyTier`, an enum `mechanic`, nullable fields where data is not always present (`originalPriceEurCents`, `priceBgnCents`, `brand`, `purchaseLimit`, `campaign`, `ean`, `imageUrl`, `imageCrop`), and required `sourceUrl`, `scrapedAt`, and `warnings` fields. Product imagery SHALL be expressed in exactly one of two forms — a direct image URL, or a crop referencing a region of a leaflet page — and which form a source uses SHALL be a property of that source, not of the individual offer. A source that publishes product photographs as their own images SHALL use the direct-URL form regardless of whether its offers originate from a promotional campaign.

#### Scenario: Cross-source consistency
- **WHEN** offers from Kaufland, Lidl, and Billa are all present in the catalog
- **THEN** all SHALL expose the same field names and types, differing only in which nullable fields are populated and which are structurally absent (e.g. `productUrl` never exists on Kaufland offers, `imageUrl` never exists on leaflet-derived offers, `imageCrop` never exists on Kaufland or Lidl offers)

#### Scenario: Prices stored as integer cents
- **WHEN** any offer is added to the catalog
- **THEN** its price fields SHALL be integers representing cents, never floating-point currency values

#### Scenario: Kaufland offer carries an image URL
- **WHEN** a Kaufland offer is added to the catalog
- **THEN** it SHALL include an `imageUrl` field, either populated with a URL or null when the source tile had no image, and SHALL NOT carry an `imageCrop` field

#### Scenario: Lidl site offer carries an image URL
- **WHEN** an offer from the Lidl product listing is added to the catalog
- **THEN** it SHALL include an `imageUrl` field, either populated with the published product photograph's URL or null when the listing carried no image, and SHALL NOT carry an `imageCrop` field

#### Scenario: Leaflet-derived offer carries an image crop
- **WHEN** an offer extracted from a leaflet page image is added to the catalog
- **THEN** it SHALL include an `imageCrop` field, either populated with a reference to a leaflet page plus a normalized bounding box, or null when no usable box was extracted for it, and SHALL NOT carry an `imageUrl` field

#### Scenario: Lidl price-list offer has no image field
- **WHEN** an offer from the Lidl XLSX price list is added to the catalog
- **THEN** the resulting record SHALL have neither an `imageUrl` nor an `imageCrop` field (not merely null ones), since that source contains no product images and no page to crop from

#### Scenario: Two sources of the same retailer use different image forms
- **WHEN** the Lidl price-list source and the Lidl product-listing source both contribute offers to one snapshot
- **THEN** each offer's image form SHALL follow the source that produced it, and the retailer SHALL NOT be required to present a single image form across both

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

### Requirement: Leaflet page images are referenced, not duplicated
The published snapshot SHALL carry a registry of the leaflet page images its offers were extracted from, keyed by a stable page identifier derived from the source and the leaflet's own identifiers, and offers SHALL reference a page by that identifier rather than embedding its URL and dimensions. The registry SHALL record, for each page, an image variant intended for display, that variant's pixel dimensions, the page number, and the leaflet URL it belongs to.

#### Scenario: Many offers extracted from one page
- **WHEN** several offers are extracted from the same leaflet page
- **THEN** the page's image URL and dimensions SHALL appear once in the registry, and each offer's crop SHALL carry only the page identifier and its own bounding box

#### Scenario: Page identifiers are stable, not positional
- **WHEN** two sources' page registries are combined into one snapshot
- **THEN** their identifiers SHALL remain distinct and unchanged without renumbering, so that a page can be attributed to its source and looked up without knowing the order in which sources were merged

#### Scenario: Crop references a page present in the same snapshot
- **WHEN** a snapshot containing image crops is published
- **THEN** every crop's page identifier SHALL resolve to an entry in the same snapshot's page registry

#### Scenario: Unreferenced pages are pruned
- **WHEN** a snapshot is published and the registry contains pages no surviving offer references
- **THEN** those entries SHALL be removed before publication, so pages from superseded leaflets do not accumulate across weeks

#### Scenario: Display variant is not the extraction variant
- **WHEN** a page is recorded in the registry
- **THEN** the recorded image SHALL be a smaller variant than the one submitted for extraction, since crop display needs materially less resolution than text extraction does
