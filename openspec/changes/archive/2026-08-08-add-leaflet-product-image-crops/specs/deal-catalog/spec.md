## MODIFIED Requirements

### Requirement: Normalized offer schema
Every offer in the catalog, regardless of source, SHALL conform to one shared schema using integer cents for all prices, an enum `loyaltyTier`, an enum `mechanic`, nullable fields where data is not always present (`originalPriceEurCents`, `priceBgnCents`, `brand`, `purchaseLimit`, `campaign`, `ean`, `imageUrl`, `imageCrop`), and required `sourceUrl`, `scrapedAt`, and `warnings` fields. Product imagery SHALL be expressed in exactly one of two forms — a direct image URL, or a crop referencing a region of a leaflet page — and which form a source uses SHALL be a property of that source, not of the individual offer.

#### Scenario: Cross-source consistency
- **WHEN** offers from Kaufland, Lidl, and Billa are all present in the catalog
- **THEN** all SHALL expose the same field names and types, differing only in which nullable fields are populated and which are structurally absent (e.g. `productUrl` never exists on Kaufland offers, `imageUrl` never exists on leaflet-derived offers, `imageCrop` never exists on Kaufland or Lidl price-list offers)

#### Scenario: Prices stored as integer cents
- **WHEN** any offer is added to the catalog
- **THEN** its price fields SHALL be integers representing cents, never floating-point currency values

#### Scenario: Kaufland offer carries an image URL
- **WHEN** a Kaufland offer is added to the catalog
- **THEN** it SHALL include an `imageUrl` field, either populated with a URL or null when the source tile had no image, and SHALL NOT carry an `imageCrop` field

#### Scenario: Leaflet-derived offer carries an image crop
- **WHEN** an offer extracted from a leaflet page image (Billa or the Lidl leaflet) is added to the catalog
- **THEN** it SHALL include an `imageCrop` field, either populated with a reference to a leaflet page plus a normalized bounding box, or null when no usable box was extracted for it, and SHALL NOT carry an `imageUrl` field

#### Scenario: Lidl price-list offer has no image field
- **WHEN** an offer from the Lidl XLSX price list is added to the catalog
- **THEN** the resulting record SHALL have neither an `imageUrl` nor an `imageCrop` field (not merely null ones), since that source contains no product images and no page to crop from

#### Scenario: Billa offer carries OCR-derived uncertainty warnings
- **WHEN** a Billa offer is added to the catalog whose non-critical fields were extracted with lower OCR confidence
- **THEN** it SHALL surface that uncertainty through the shared `warnings` field, using the same mechanism as any other source's warnings, rather than a Billa-specific schema field

## ADDED Requirements

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
