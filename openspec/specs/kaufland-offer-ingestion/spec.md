# kaufland-offer-ingestion Specification

## Purpose

Fetches Kaufland Bulgaria's public weekly offers page and converts each product tile into a normalized offer record for the shared deal catalog, without bypassing any anti-bot protection.

## Requirements

### Requirement: Fetch offers page without evasion
The system SHALL fetch `https://www.kaufland.bg/aktualni-predlozheniya/oferti.html` via a plain HTTP GET, without faking headers, cookies, or session state to evade detection, and without executing client-side JavaScript.

#### Scenario: Successful fetch
- **WHEN** the scheduled job requests the offers page
- **THEN** the system SHALL receive and parse the server-rendered HTML directly, with no headless browser involved

#### Scenario: Fetch failure
- **WHEN** the fetch fails or returns a non-200 response
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial Kaufland offer set in place of the last known-good data

### Requirement: Parse product tile fields
For each product tile on the page, the system SHALL extract: brand (nullable), product name, unit/quantity text, discount percentage as displayed on the site, price in EUR cents, price in BGN cents (nullable), original price in EUR cents (nullable), loyalty tier, promo mechanic, purchase limit (nullable), category, and per-offer validity dates.

#### Scenario: Tile without a crossed-out original price
- **WHEN** a product tile shows no original/old price
- **THEN** `originalPriceEurCents` SHALL be null, not zero and not equal to the current price

#### Scenario: Tile with loyalty-card pricing
- **WHEN** a tile displays a "Kaufland Card" or "Kaufland Card Xtra" price tag
- **THEN** the system SHALL set `loyaltyTier` to the matching enum value rather than a boolean flag

#### Scenario: Discount percentage taken from the page
- **WHEN** a tile displays a discount percentage (e.g. "-66%")
- **THEN** the system SHALL use that displayed value directly rather than recomputing it from the two prices

### Requirement: Extract EAN from product image URL
When a product tile's image URL contains a numeric barcode-like segment (e.g. `.../8606018614950_BG_P`), the system SHALL extract it into an `ean` field on the offer. Regardless of whether a barcode segment is found, the system SHALL also populate the offer's `imageUrl` field with the tile's raw image URL.

#### Scenario: Barcode present in image URL
- **WHEN** the image URL contains a numeric segment matching an EAN-13 pattern
- **THEN** the system SHALL populate `ean` with that value
- **AND** the system SHALL populate `imageUrl` with the full image URL

#### Scenario: No barcode segment found
- **WHEN** the image URL does not contain a recognizable barcode segment
- **THEN** `ean` SHALL be null
- **AND** the system SHALL still populate `imageUrl` with the full image URL

#### Scenario: Tile has no image URL
- **WHEN** a product tile's raw data has no image URL at all
- **THEN** both `ean` and `imageUrl` SHALL be null

### Requirement: No product URL field
The system SHALL NOT populate a `productUrl` field for Kaufland offers, since Kaufland's product tiles do not link to a real product page (confirmed: the tile's `href` is always `"#"`).

#### Scenario: Parsing a product tile
- **WHEN** a product tile is parsed
- **THEN** the resulting offer record SHALL have no `productUrl` field (not merely a null one)

### Requirement: Per-offer validity from surrounding campaign block
Discount validity dates SHALL be attached per offer using the dates of the campaign block the offer appears under, not a single global validity window for the whole page.

#### Scenario: Mixed campaigns on one page
- **WHEN** the page contains both a base-week block and a named sub-campaign block (e.g. "Super Weekend") with different date ranges
- **THEN** offers from each block SHALL carry that block's own `validFrom`/`validUntil`, and offers from a named sub-campaign SHALL carry that campaign's name in a `campaign` field while base-week offers carry `campaign: null`

### Requirement: Respect robots.txt
The system SHALL only fetch paths permitted by `kaufland.bg`'s `robots.txt` and SHALL NOT attempt to bypass Cloudflare or other anti-bot protections if encountered.

#### Scenario: Path disallowed by robots.txt
- **WHEN** a candidate path is disallowed by `robots.txt`
- **THEN** the system SHALL NOT fetch it

### Requirement: Provenance metadata
Every normalized Kaufland offer SHALL include `sourceUrl` (the exact page fetched) and `scrapedAt` (an ISO timestamp of the fetch).

#### Scenario: Successful parse run
- **WHEN** offers are parsed from a successful fetch
- **THEN** each offer SHALL carry the source URL and a scrape timestamp
