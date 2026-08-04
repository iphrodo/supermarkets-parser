# lidl-leaflet-offer-ingestion Specification

## Purpose

Locates Lidl Bulgaria's current weekly leaflet (hosted by the Schwarz-Gruppe leaflets platform), fetches its page images, and extracts normalized offer records via vision extraction, as a second Lidl offer source alongside the existing XLSX price-list ingestion, since the leaflet surfaces promotional items the price list omits.

## Requirements

### Requirement: Locate the current week's leaflet
The system SHALL determine the currently active weekly leaflet identifier on each scheduled run, rather than relying on a hardcoded or previously-known identifier, since multiple leaflets/campaigns are listed simultaneously and the weekly one's identifier changes week to week.

#### Scenario: Multiple leaflets listed simultaneously
- **WHEN** the leaflet listing page shows the current weekly leaflet alongside one or more longer-running thematic or evergreen campaign leaflets
- **THEN** the system SHALL identify and use only the weekly leaflet (the one whose validity period spans exactly seven days), not a campaign leaflet

#### Scenario: Leaflet identifier changes week to week
- **WHEN** a new week's leaflet is published under a different identifier than the previous run
- **THEN** the system SHALL discover and use the new identifier without requiring a code change or manual configuration update

#### Scenario: No current weekly leaflet found
- **WHEN** the system cannot determine exactly one current weekly leaflet (zero or more than one candidate matches)
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial offer set for this source in place of the last known-good data

### Requirement: Fetch leaflet page images
For the current weekly leaflet, the system SHALL fetch every page image, in page order, using only publicly accessible leaflet-platform endpoints (no authentication bypass or access-control circumvention).

#### Scenario: Successful fetch
- **WHEN** the current weekly leaflet has been located
- **THEN** the system SHALL retrieve all of its page images before extraction begins

#### Scenario: A page image fails to fetch
- **WHEN** one or more page images fail to download
- **THEN** the system SHALL extract offers from the pages it successfully fetched, SHALL record a warning noting which pages were skipped, and SHALL NOT fail the entire run because of the missing pages

### Requirement: Extract offers via vision with confidence gating
The system SHALL run each fetched page image through a vision extraction step to identify product name and price, and SHALL only emit an offer for an extracted item when the extraction meets a defined confidence bar for the offer's price.

#### Scenario: High-confidence extraction
- **WHEN** vision extraction for an item yields a clearly legible price
- **THEN** the system SHALL emit an offer for that item

#### Scenario: Low-confidence or ambiguous extraction
- **WHEN** vision extraction for an item cannot confidently determine its price
- **THEN** the system SHALL exclude that item from the emitted offers rather than guessing or emitting a zero/placeholder price

#### Scenario: Extraction succeeds but with residual uncertainty
- **WHEN** an item is emitted as an offer but some non-critical field (e.g. brand, unit text, category) was extracted with lower confidence
- **THEN** the offer SHALL carry a warning describing which field is uncertain, rather than silently presenting it as equally reliable to a cleanly-extracted field

### Requirement: Validity dates from leaflet metadata
Unlike vision-based price extraction, each offer's validity period SHALL be taken from the weekly leaflet's own published validity metadata rather than read from the page image, since that metadata is a reliable, structured source for this platform.

#### Scenario: Leaflet has a published validity period
- **WHEN** the current weekly leaflet's metadata specifies a start and end date
- **THEN** every offer extracted from that leaflet SHALL carry that same validity period as its `validFrom`/`validUntil`

### Requirement: Provenance metadata
Every normalized offer from this source SHALL include `sourceUrl` (the leaflet page URL it was extracted from) and `scrapedAt` (an ISO timestamp of the extraction run), and SHALL be tagged with the same retailer identifier used by the existing Lidl price-list source so both contribute to one combined Lidl offer set.

#### Scenario: Successful extraction run
- **WHEN** offers are extracted from a successfully fetched page
- **THEN** each resulting offer SHALL carry the leaflet page source URL, an extraction timestamp, and the shared Lidl retailer identifier

### Requirement: National scope by default
Offers from this source SHALL be tagged `scope: 'national'` with no store reference, unless the leaflet content itself indicates a store- or region-specific offer.

#### Scenario: Leaflet-wide offer
- **WHEN** an offer appears in the general leaflet with no store/region qualifier shown
- **THEN** the resulting offer SHALL be tagged `scope: 'national'` with no store reference attached

### Requirement: Skip re-ingestion when leaflet is unchanged
If the currently active weekly leaflet identifier is the same as the one processed on the previous run, the system SHALL skip re-fetching page images and re-running vision extraction, and SHALL reuse this source's previously extracted offers instead.

#### Scenario: Leaflet unchanged since last run
- **WHEN** the current weekly leaflet's identifier matches the identifier recorded from the previous successful run
- **THEN** the system SHALL return this source's previously extracted offers without re-fetching page images or invoking vision extraction
