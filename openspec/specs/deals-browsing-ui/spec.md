# deals-browsing-ui Specification

## Purpose

Presents the cached deal catalog to the end user as a single filterable page, always reading from the pre-built snapshot and never triggering live scraping from a page request.

## Requirements

### Requirement: Filterable listing
The page SHALL let the user filter offers by retailer, category, and price. Filtering SHALL operate over the full set of matching offers even though only an initial batch is rendered at a time.

#### Scenario: Filter by retailer
- **WHEN** the user selects a single retailer filter (e.g. "Lidl")
- **THEN** only offers from that retailer SHALL be shown

#### Scenario: Combined filters
- **WHEN** the user selects a retailer, a category, and a price range together
- **THEN** only offers matching all three criteria SHALL be shown

#### Scenario: Changing filters resets the visible batch
- **WHEN** the user changes any filter (retailer, category, or price) while additional offers from the previous filter selection are still unrendered below the fold
- **THEN** the visible list SHALL be replaced by the first batch of offers matching the new filters, discarding any previously rendered batch state

### Requirement: Incremental scroll-triggered rendering
The page SHALL render only a bounded initial batch of matching offers on load, and SHALL render additional batches of already-available offers as the user scrolls toward the end of the currently rendered list, instead of rendering all matching offers at once.

#### Scenario: Initial page load
- **WHEN** the deals page loads with N matching offers where N exceeds one batch
- **THEN** only the first batch of offers SHALL be rendered, and the remaining offers SHALL not be present in the rendered DOM

#### Scenario: Scrolling near the end of the rendered list
- **WHEN** the user scrolls so that the bottom of the currently rendered offers approaches the viewport
- **THEN** the next batch of matching offers SHALL be appended to the rendered list without requiring a manual action (e.g. a "load more" click) or a full page reload

#### Scenario: All matching offers already rendered
- **WHEN** every offer matching the current filters has already been rendered
- **THEN** scrolling further SHALL NOT trigger any additional rendering, and the page SHALL indicate that the end of the list has been reached

#### Scenario: No matching offers
- **WHEN** the current filters match zero offers
- **THEN** the page SHALL show the existing empty-results state and SHALL NOT attempt to render any batch or scroll-loading indicator

### Requirement: Source attribution on every offer
Each displayed offer SHALL show which retailer it came from, alongside a reference to the retailer's own source page or file.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its retailer name and source attribution SHALL be visible without requiring further user interaction

### Requirement: Product image on offer card
Each displayed offer SHALL show its product image when the offer's `imageUrl` field is populated, and SHALL render without an image area when no image is available or the image fails to load.

#### Scenario: Offer has a populated image URL
- **WHEN** an offer is displayed whose `imageUrl` field is populated
- **THEN** the product image SHALL be visible on the offer card

#### Scenario: Offer has no image URL
- **WHEN** an offer is displayed whose `imageUrl` field is null, or whose schema has no `imageUrl` field at all (e.g. a Lidl offer)
- **THEN** the offer card SHALL render without an image area, and SHALL NOT show a broken-image placeholder or leave an empty gap in the layout

#### Scenario: Image fails to load
- **WHEN** an offer's `imageUrl` is populated but the image resource fails to load (broken link, network error)
- **THEN** the offer card SHALL fall back to the no-image layout instead of showing a broken-image icon

### Requirement: Offer end date on offer card
Each displayed offer SHALL show the date its discount expires (`validUntil`), formatted as a human-readable date rather than a raw ISO timestamp.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its end date SHALL be visible on the card without requiring further user interaction

#### Scenario: End date formatting
- **WHEN** an offer's `validUntil` value is rendered
- **THEN** it SHALL be shown as a human-readable date (e.g. including a day, month, and year) rather than the raw ISO date string

### Requirement: ISR-served, no live scraping on request
The page SHALL be served via incremental static regeneration reading the cached snapshot; a page request SHALL NOT block on, or trigger, a live scrape.

#### Scenario: Request during a stale cache window
- **WHEN** the cached snapshot is older than the expected time of the last scheduled cron run
- **THEN** the page SHALL still render the most recent available snapshot rather than scraping live or returning an error
