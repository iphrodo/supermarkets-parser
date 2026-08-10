## Purpose

Fetches BulMag's current weekly-brochure promotional products from its public JSON storefront API and normalizes them into offer records, without OCR/vision extraction since BulMag publishes structured product data directly.

## ADDED Requirements

### Requirement: Fetch only brochure-tagged offers
The system SHALL restrict emitted BulMag offers to products tagged as part of the current weekly brochure, rather than BulMag's full always-on discount catalog, so that BulMag's offer volume and freshness cadence match the other weekly-leaflet sources in the catalog.

#### Scenario: Brochure tag filter is available
- **WHEN** the system can identify which of BulMag's promotional products are tagged as weekly-brochure items
- **THEN** it SHALL emit offers only for that tagged subset

#### Scenario: Brochure tag filter cannot be confirmed
- **WHEN** the system cannot confirm which promotional products are brochure-tagged (e.g. the filtering mechanism it relies on stops working)
- **THEN** it SHALL NOT silently fall back to publishing BulMag's entire always-on discount catalog in place of the brochure subset, and SHALL instead fail the run without publishing a BulMag offer set for that run

### Requirement: Determine a shared validity window economically
The system SHALL establish the current brochure's validity period (`validFrom`/`validUntil`) using a small sample of the listed products rather than querying every listed product individually, since the listing itself does not carry validity dates.

#### Scenario: Sampled items agree on one validity window
- **WHEN** a small sample of listed brochure products all report the same validity period
- **THEN** the system SHALL apply that single validity period to every offer emitted from the current run

#### Scenario: Sampled items disagree on validity window
- **WHEN** the sampled products do not agree on a single validity period
- **THEN** the system SHALL NOT guess or average a validity period, and SHALL fail the run without publishing a BulMag offer set for that run rather than emitting offers with a fabricated date range

#### Scenario: Validity window cannot be determined at all
- **WHEN** every attempt to sample a validity period fails
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial BulMag offer set in place of the last known-good data

### Requirement: No EAN available — retailer-scoped identity only
Since BulMag's API exposes no barcode/EAN for any product, the system SHALL always compute BulMag offer identity from product name and unit text, and SHALL NOT substitute a BulMag-internal product code as if it were a cross-retailer EAN.

#### Scenario: BulMag offer identity
- **WHEN** a BulMag offer is normalized
- **THEN** its `ean` field SHALL be null, and its `productKey` SHALL be derived from name and unit text rather than any BulMag-internal identifier

### Requirement: Derive unit text without guessing unit price
The system SHALL derive `unitText` from the clearest available signal (an explicit quantity in the product name, or a safe default for items sold as a single piece), and SHALL NOT fabricate a quantity it cannot support with reasonable confidence.

#### Scenario: Quantity is embedded in the product name
- **WHEN** a product's name includes an explicit size or quantity
- **THEN** the resulting offer's `unitText` SHALL reflect that quantity

#### Scenario: Product is sold as a single piece with no explicit size
- **WHEN** a product is sold per piece and its name carries no explicit size
- **THEN** the resulting offer's `unitText` SHALL default to a single-piece quantity

#### Scenario: Quantity cannot be confidently determined
- **WHEN** neither the product name nor its sale unit yields a confident quantity (e.g. a loose-weight item with no stated pack size)
- **THEN** the system SHALL publish the offer with an empty `unitText` and a warning noting the omission, rather than guessing a quantity that could silently corrupt unit-price comparisons

### Requirement: Conservative request pacing with retry on transient failures
Since establishing a BulMag offer set requires more requests per run than the catalog's other sources, the system SHALL pace its requests and retry transient failures (rate-limiting or server errors) rather than treating a single transient failure as fatal to the run.

#### Scenario: A request fails transiently and later succeeds
- **WHEN** a request to BulMag's API fails with a transient error (e.g. rate-limiting or a server error)
- **THEN** the system SHALL retry it with backoff before treating the run as failed

#### Scenario: Retries are exhausted
- **WHEN** a request continues to fail after retrying
- **THEN** the system SHALL fail that portion of the run rather than under-reporting BulMag's offers by silently proceeding with incomplete data

### Requirement: Provenance metadata
Every normalized BulMag offer SHALL include `sourceUrl` (a link back to the product on BulMag's site) and `scrapedAt` (an ISO timestamp of the run that produced it).

#### Scenario: Successful ingestion run
- **WHEN** offers are emitted from a successful BulMag ingestion run
- **THEN** each resulting offer SHALL carry a source URL and the run's timestamp

### Requirement: National scope by default, pending verification
BulMag offers SHALL be tagged `scope: 'national'` with no store reference by default, mirroring the default already assumed for Kaufland pending verification, since BulMag's promotional pricing was not confirmed to vary by store during initial investigation.

#### Scenario: Brochure-wide offer
- **WHEN** a BulMag offer is listed with no per-store price variation confirmed
- **THEN** the resulting offer SHALL be tagged `scope: 'national'` with no store reference attached
