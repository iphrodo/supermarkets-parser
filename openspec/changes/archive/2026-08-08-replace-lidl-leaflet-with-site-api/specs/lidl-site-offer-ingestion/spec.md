## Purpose

Reads Lidl Bulgaria's current promotional offers directly from the public product search API that lidl.bg's own storefront calls, yielding structured prices, validity windows, and product photographs without vision extraction, as the promotional Lidl source alongside the XLSX price-list ingestion.

## ADDED Requirements

### Requirement: Read offers from the public product search API
The system SHALL obtain Lidl offers from the product search endpoint lidl.bg's own storefront calls, using only publicly accessible, unauthenticated requests with no headless browser, no session emulation, and no anti-bot circumvention. The system SHALL NOT request paths that lidl.bg's `robots.txt` disallows.

#### Scenario: Successful ingestion run
- **WHEN** a scheduled sync runs this source
- **THEN** the system SHALL retrieve the product listing over ordinary HTTP requests and derive offers from the structured response, without rendering client-side JavaScript

#### Scenario: The endpoint is unreachable or returns an unusable payload
- **WHEN** the request fails, or the response cannot be interpreted as a product listing
- **THEN** the system SHALL fail this source loudly and SHALL NOT publish an empty or partial offer set in place of the last known-good data

### Requirement: Paginate until the full result set is read
The listing endpoint caps how many products it returns per request regardless of the page size requested, and reports the total number of matches. The system SHALL page through the result set until it has read every match, and SHALL deduplicate products that appear in more than one page.

#### Scenario: Result set exceeds one page
- **WHEN** the reported total exceeds the number of products returned in a single response
- **THEN** the system SHALL continue requesting successive pages until it has read the reported total, rather than ingesting only the first page

#### Scenario: Requested page size is not honoured
- **WHEN** the endpoint returns fewer products per page than requested
- **THEN** the system SHALL advance its paging offset by the number actually returned, not by the number requested, so no product is skipped

#### Scenario: Pagination does not terminate
- **WHEN** successive pages keep returning products without reaching the reported total, or return products already seen
- **THEN** the system SHALL stop after a bounded number of requests rather than looping indefinitely against the upstream site

#### Scenario: The same product appears on more than one page
- **WHEN** paging returns a product already read from an earlier page
- **THEN** the system SHALL emit at most one offer for it

### Requirement: Publish only offers that are live and comparable
The listing includes products whose promotion has not yet started, products whose promotion has ended, non-food ranges, and products carrying no price or no discount. The system SHALL publish an offer only when the product's promotional window contains the run time, the product belongs to a food or drink category, and the product carries both a price and a discount indication.

#### Scenario: Promotion starts in a future week
- **WHEN** a product's promotional window begins after the current run time
- **THEN** no offer SHALL be published for it in this run, and it SHALL become eligible on a later run once its window has opened

#### Scenario: Promotion has already ended
- **WHEN** a product's promotional window ended before the current run time
- **THEN** no offer SHALL be published for it

#### Scenario: Non-food range
- **WHEN** a product belongs to a non-food range (such as clothing, garden, tools, or toys)
- **THEN** no offer SHALL be published for it, since it has no cross-retailer equivalent to compare against

#### Scenario: Product carries no price or no discount
- **WHEN** a product is listed without a usable price, or without any indication that it is discounted
- **THEN** no offer SHALL be published for it, rather than an offer with a zero or placeholder price

### Requirement: Validity window from structured timestamps
Each offer's `validFrom` and `validUntil` SHALL be derived from the machine-readable validity timestamps the listing publishes for the product, not parsed out of human-readable availability text.

#### Scenario: Product carries structured validity timestamps
- **WHEN** a product's listing entry carries a start and end timestamp for its in-store availability
- **THEN** the resulting offer SHALL carry the corresponding calendar dates as its `validFrom` and `validUntil`

#### Scenario: Product carries only prose availability text
- **WHEN** a product's availability is expressed only as display text with no accompanying structured timestamps
- **THEN** no offer SHALL be published for it, rather than dates being inferred from that text

### Requirement: Discount percentage from structured value or discount label
The listing expresses a discount either as a numeric percentage alongside a struck-through original price, or as a label naming the reduction. The system SHALL prefer the structured numeric value, SHALL fall back to the percentage stated in the label when no structured value is present, and SHALL record a warning when neither yields a percentage.

#### Scenario: Structured discount present
- **WHEN** a product carries a numeric discount percentage and a previous price
- **THEN** the offer SHALL carry that percentage as `discountPercentage` and the previous price as `originalPriceEurCents`

#### Scenario: Only a discount label is present
- **WHEN** a product carries a discount label stating a percentage but no structured percentage field
- **THEN** the offer SHALL carry the percentage read from that label

#### Scenario: Discount is expressed without a percentage
- **WHEN** a product's discount is indicated only by a label that states no percentage
- **THEN** the offer SHALL still be published, SHALL carry a zero `discountPercentage`, and SHALL carry a warning that the reduction could not be quantified

#### Scenario: No previous price is published
- **WHEN** a product is discounted but no previous price is published for it
- **THEN** `originalPriceEurCents` SHALL be null rather than zero

### Requirement: Direct product image URL
Offers from this source SHALL carry `imageUrl` pointing at the product photograph the listing publishes, and SHALL NOT carry an `imageCrop`, since the photograph is served as its own image rather than as a region of a leaflet page. The system SHALL use the image URL exactly as published.

#### Scenario: Product photograph published
- **WHEN** a product's listing entry includes a product image
- **THEN** the resulting offer SHALL carry that image's URL in `imageUrl`

#### Scenario: Image URLs are signed
- **WHEN** the published image URL encodes a fixed size and is signed against tampering
- **THEN** the system SHALL use it unmodified and SHALL NOT attempt to rewrite it to request a different size

#### Scenario: Product has no photograph
- **WHEN** a product's listing entry includes no image
- **THEN** the offer SHALL still be published with a null `imageUrl`

### Requirement: Provenance metadata and shared retailer identity
Every offer from this source SHALL carry `sourceUrl` pointing at the product's own page on the retailer's site, `scrapedAt` as an ISO timestamp of the run, and the same retailer identifier used by the Lidl price-list source, so both contribute to one combined Lidl offer set while remaining distinguishable from one another.

#### Scenario: Successful ingestion run
- **WHEN** offers are published from this source
- **THEN** each SHALL carry a product-page URL, an ingestion timestamp, and the shared Lidl retailer identifier

#### Scenario: Distinguishing this source's offers from the price list's
- **WHEN** this source's previously published offers must be identified within an earlier snapshot
- **THEN** they SHALL be distinguishable from the Lidl price-list source's offers by their provenance, not by retailer identifier alone

### Requirement: Internal article numbers are not published as EAN
The product identifiers this listing publishes are the retailer's internal article numbers, not GTIN/EAN-13 barcodes. The system SHALL NOT populate `ean` from them.

#### Scenario: Product carries an internal article number
- **WHEN** a product's listing entry carries the retailer's own article number
- **THEN** the resulting offer's `ean` SHALL be null, so that cross-retailer identity is never established on a non-barcode identifier

### Requirement: National scope
Offers from this source SHALL be tagged `scope: 'national'` with no store reference, consistent with the verified finding that Lidl Bulgaria's prices do not vary between stores.

#### Scenario: Offer published
- **WHEN** an offer from this source is published
- **THEN** it SHALL carry `scope: 'national'` and no store reference
