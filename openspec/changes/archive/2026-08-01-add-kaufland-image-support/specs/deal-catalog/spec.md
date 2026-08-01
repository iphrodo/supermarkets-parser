## MODIFIED Requirements

### Requirement: Normalized offer schema
Every offer in the catalog, regardless of source, SHALL conform to one shared schema using integer cents for all prices, an enum `loyaltyTier`, an enum `mechanic`, nullable fields where data is not always present (`originalPriceEurCents`, `priceBgnCents`, `brand`, `purchaseLimit`, `campaign`, `ean`, `imageUrl`), and required `sourceUrl`, `scrapedAt`, and `warnings` fields.

#### Scenario: Cross-source consistency
- **WHEN** offers from Kaufland and Lidl are both present in the catalog
- **THEN** both SHALL expose the same field names and types, differing only in which nullable fields are populated and which are structurally absent (e.g. `productUrl` never exists on Kaufland offers, `imageUrl` never exists on Lidl offers)

#### Scenario: Prices stored as integer cents
- **WHEN** any offer is added to the catalog
- **THEN** its price fields SHALL be integers representing cents, never floating-point currency values

#### Scenario: Kaufland offer carries an image URL
- **WHEN** a Kaufland offer is added to the catalog
- **THEN** it SHALL include an `imageUrl` field, either populated with a URL or null when the source tile had no image

#### Scenario: Lidl offer has no image field
- **WHEN** a Lidl offer is added to the catalog
- **THEN** the resulting record SHALL have no `imageUrl` field (not merely a null one), since Lidl's source data contains no product images
