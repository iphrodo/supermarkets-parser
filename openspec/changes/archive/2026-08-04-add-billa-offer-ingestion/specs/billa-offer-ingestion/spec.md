## Purpose

Locates Billa Bulgaria's current weekly digital leaflet (hosted by the third-party Publitas platform), fetches its page images, and extracts normalized offer records via OCR/vision, since Billa publishes no structured product or price feed.

## ADDED Requirements

### Requirement: Locate the current week's publication
The system SHALL determine the currently active Publitas publication for Billa's weekly leaflet on each scheduled run, rather than relying on a hardcoded or previously-known publication identifier, since the underlying slug changes weekly.

#### Scenario: Publication reference changes week to week
- **WHEN** a new week's leaflet is published under a different Publitas publication identifier than the previous run
- **THEN** the system SHALL discover and use the new identifier without requiring a code change or manual configuration update

#### Scenario: No current publication found
- **WHEN** the system cannot determine a current Billa leaflet publication
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial Billa offer set in place of the last known-good data

### Requirement: Fetch leaflet page images
For the current publication, the system SHALL fetch every page image of the leaflet, in page order, using only publicly accessible Publitas endpoints (no authentication bypass or access-control circumvention).

#### Scenario: Successful fetch
- **WHEN** a current publication has been located
- **THEN** the system SHALL retrieve all of its page images before extraction begins

#### Scenario: A page image fails to fetch
- **WHEN** one or more page images fail to download
- **THEN** the system SHALL extract offers from the pages it successfully fetched, SHALL record a warning noting which pages were skipped, and SHALL NOT fail the entire run because of the missing pages

### Requirement: Extract offers via OCR with confidence gating
The system SHALL run each fetched page image through an OCR/vision extraction step to identify product name, price, discount/validity information, and SHALL only emit an offer for an extracted item when the extraction meets a defined confidence bar for the offer's price and validity dates.

#### Scenario: High-confidence extraction
- **WHEN** OCR extraction for an item yields a clearly legible price and validity period
- **THEN** the system SHALL emit an offer for that item

#### Scenario: Low-confidence or ambiguous extraction
- **WHEN** OCR extraction for an item cannot confidently determine its price or validity period
- **THEN** the system SHALL exclude that item from the emitted offers rather than guessing or emitting a zero/placeholder price

#### Scenario: Extraction succeeds but with residual uncertainty
- **WHEN** an item is emitted as an offer but some non-critical field (e.g. brand, unit text, category) was extracted with lower confidence
- **THEN** the offer SHALL carry a warning describing which field is uncertain, rather than silently presenting it as equally reliable to a cleanly-extracted field

### Requirement: Provenance metadata
Every normalized Billa offer SHALL include `sourceUrl` (the leaflet page or publication URL it was extracted from) and `scrapedAt` (an ISO timestamp of the extraction run).

#### Scenario: Successful extraction run
- **WHEN** offers are extracted from a successfully fetched page
- **THEN** each resulting offer SHALL carry the source URL and an extraction timestamp

### Requirement: National scope by default
Billa offers SHALL be tagged `scope: 'national'` with no store reference, unless the leaflet content itself indicates a store- or region-specific offer.

#### Scenario: Leaflet-wide offer
- **WHEN** an offer appears in the general leaflet with no store/region qualifier shown
- **THEN** the resulting offer SHALL be tagged `scope: 'national'` with no store reference attached
