# billa-offer-ingestion Specification

## Purpose

Locates Billa Bulgaria's current weekly digital leaflet (hosted by the third-party Publitas platform), fetches its page images, and extracts normalized offer records via OCR/vision, since Billa publishes no structured product or price feed.

## Requirements

### Requirement: Locate the current week's publication
The system SHALL determine the currently active Publitas publication for Billa's weekly leaflet on each scheduled run, rather than relying on a hardcoded or previously-known publication identifier, since the underlying slug changes weekly.

#### Scenario: Publication reference changes week to week
- **WHEN** a new week's leaflet is published under a different Publitas publication identifier than the previous run
- **THEN** the system SHALL discover and use the new identifier without requiring a code change or manual configuration update

#### Scenario: No current publication found
- **WHEN** the system cannot determine a current Billa leaflet publication
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial Billa offer set in place of the last known-good data

### Requirement: Fetch leaflet page images
For the current publication, the system SHALL fetch every page image of the leaflet, in page order, using only publicly accessible Publitas endpoints (no authentication bypass or access-control circumvention). The system SHALL distinguish the image variant submitted for extraction from a smaller variant recorded for later display, and SHALL record each page's display variant together with its pixel dimensions.

#### Scenario: Successful fetch
- **WHEN** a current publication has been located
- **THEN** the system SHALL retrieve all of its page images before extraction begins

#### Scenario: A page image fails to fetch
- **WHEN** one or more page images fail to download
- **THEN** the system SHALL extract offers from the pages it successfully fetched, SHALL record a warning noting which pages were skipped, and SHALL NOT fail the entire run because of the missing pages

#### Scenario: Extraction and display variants differ
- **WHEN** the system selects page images for a publication
- **THEN** it SHALL submit a higher-resolution variant to extraction and SHALL record a lower-resolution variant for display, so that display cost is not tied to the resolution text extraction requires

#### Scenario: Page dimensions are not published by the platform
- **WHEN** the platform's page manifest does not state a page's pixel dimensions
- **THEN** the system SHALL derive them from the selected image reference rather than assuming a fixed page size, since crop geometry depends on the true aspect ratio

### Requirement: Extract offers via OCR with confidence gating
The system SHALL run each fetched page image through an OCR/vision extraction step to identify product name, price, discount/validity information, and the location of the product's photograph on the page, and SHALL only emit an offer for an extracted item when the extraction meets a defined confidence bar for the offer's price and validity dates. The product location SHALL be requested in the same extraction call, not a separate pass, and SHALL be gated independently of the offer itself.

#### Scenario: High-confidence extraction
- **WHEN** OCR extraction for an item yields a clearly legible price and validity period
- **THEN** the system SHALL emit an offer for that item

#### Scenario: Low-confidence or ambiguous extraction
- **WHEN** OCR extraction for an item cannot confidently determine its price or validity period
- **THEN** the system SHALL exclude that item from the emitted offers rather than guessing or emitting a zero/placeholder price

#### Scenario: Extraction succeeds but with residual uncertainty
- **WHEN** an item is emitted as an offer but some non-critical field (e.g. brand, unit text, category) was extracted with lower confidence
- **THEN** the offer SHALL carry a warning describing which field is uncertain, rather than silently presenting it as equally reliable to a cleanly-extracted field

#### Scenario: Product photograph is located during extraction
- **WHEN** an item is extracted from a page and its photograph is identifiable on that page
- **THEN** the extraction SHALL yield a bounding box for that photograph, expressed in coordinates normalized to the page, in the same call that yields the item's name and price

#### Scenario: Low-confidence or implausible bounding box
- **WHEN** an item's bounding box is reported without confidence, or is geometrically implausible (inverted, degenerate, occupying an implausibly large share of the page, or of an extreme aspect ratio)
- **THEN** the box SHALL be discarded and the offer SHALL still be emitted without an image, rather than the offer being dropped or an unvalidated box being trusted

#### Scenario: Two items claim overlapping regions
- **WHEN** two items extracted from the same page have substantially overlapping bounding boxes
- **THEN** both items SHALL lose their box, since it cannot be determined which item the region depicts and showing the wrong product is worse than showing none

#### Scenario: Item has no photograph of its own
- **WHEN** an item appears on the page without its own photograph (a text-only tile, a section banner, or a photograph shared with other items)
- **THEN** no bounding box SHALL be recorded for it, and the offer SHALL still be emitted

#### Scenario: Discarded boxes do not pollute offer warnings
- **WHEN** bounding boxes are discarded during a run
- **THEN** the system SHALL report the discards as an aggregate for the run rather than attaching a warning to each affected offer, so that per-offer warnings remain reserved for data-quality issues about the offer itself

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
