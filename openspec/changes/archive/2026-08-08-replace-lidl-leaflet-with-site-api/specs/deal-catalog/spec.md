## MODIFIED Requirements

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
