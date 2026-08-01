## Purpose

Presents the cached deal catalog to the end user as a single filterable page, always reading from the pre-built snapshot and never triggering live scraping from a page request.

## ADDED Requirements

### Requirement: Filterable listing
The page SHALL let the user filter offers by retailer, category, and price.

#### Scenario: Filter by retailer
- **WHEN** the user selects a single retailer filter (e.g. "Lidl")
- **THEN** only offers from that retailer SHALL be shown

#### Scenario: Combined filters
- **WHEN** the user selects a retailer, a category, and a price range together
- **THEN** only offers matching all three criteria SHALL be shown

### Requirement: Source attribution on every offer
Each displayed offer SHALL show which retailer it came from, alongside a reference to the retailer's own source page or file.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its retailer name and source attribution SHALL be visible without requiring further user interaction

### Requirement: ISR-served, no live scraping on request
The page SHALL be served via incremental static regeneration reading the cached snapshot; a page request SHALL NOT block on, or trigger, a live scrape.

#### Scenario: Request during a stale cache window
- **WHEN** the cached snapshot is older than the expected time of the last scheduled cron run
- **THEN** the page SHALL still render the most recent available snapshot rather than scraping live or returning an error
