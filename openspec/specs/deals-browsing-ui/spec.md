# deals-browsing-ui Specification

## Purpose

Presents the cached deal catalog to the end user as a single filterable page, always reading from the pre-built snapshot and never triggering live scraping from a page request.

## Requirements

### Requirement: Price comparison is the landing view
The landing page SHALL present cross-retailer price comparisons rather than the flat offer list, showing for each canonical product type the participating retailers' per-unit prices with the cheapest one visually distinguished.

#### Scenario: Landing page load
- **WHEN** a user opens the site root
- **THEN** comparison groups SHALL be rendered, ordered by potential saving, each showing one row per retailer with its price per base unit and the cheapest row marked

#### Scenario: No comparison groups available
- **WHEN** the published snapshot contains no comparison groups
- **THEN** the page SHALL show an explicit empty state explaining that no product is currently on offer in two or more stores, rather than an empty screen

#### Scenario: Comparison entries are traceable to their offers
- **WHEN** a comparison entry is displayed
- **THEN** the underlying offer's product name, pack size, and retailer SHALL be visible, so the user can see what is being compared

#### Scenario: Comparison entry links to its source
- **WHEN** a comparison entry is displayed
- **THEN** a link to that offer's `sourceUrl` SHALL be visible and SHALL open in a new tab, for every retailer row in the group, not only the cheapest one

#### Scenario: Comparison entry shows its EAN when available
- **WHEN** a comparison entry's underlying offer has a non-null `ean`
- **THEN** the EAN code SHALL be visible on that entry

#### Scenario: Comparison entry has no EAN
- **WHEN** a comparison entry's underlying offer has `ean: null`
- **THEN** no EAN code SHALL be shown for that entry, and no empty placeholder or stray separator SHALL be left in its place

### Requirement: Filterable listing
The full offer listing SHALL remain available on its own route, reachable from the landing view, and SHALL let the user filter offers by retailer, category, and price. Filtering SHALL operate over the full set of matching offers even though only an initial batch is rendered at a time.

#### Scenario: Reaching the full listing
- **WHEN** a user follows the navigation from the comparison view to the full offer list
- **THEN** the full filterable offer listing SHALL be shown with its filtering and incremental-scroll behavior unchanged

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
Both the comparison view and the full offer listing SHALL render only a bounded initial batch of matching items on load, and SHALL render additional batches of already-available items as the user scrolls toward the end of the currently rendered list, instead of rendering all matching items at once.

#### Scenario: Initial page load
- **WHEN** a page loads with N matching items where N exceeds one batch
- **THEN** only the first batch SHALL be rendered, and the remaining items SHALL not be present in the rendered DOM

#### Scenario: Scrolling near the end of the rendered list
- **WHEN** the user scrolls so that the bottom of the currently rendered items approaches the viewport
- **THEN** the next batch SHALL be appended to the rendered list without requiring a manual action (e.g. a "load more" click) or a full page reload

#### Scenario: All matching items already rendered
- **WHEN** every item matching the current view has already been rendered
- **THEN** scrolling further SHALL NOT trigger any additional rendering, and the page SHALL indicate that the end of the list has been reached

#### Scenario: No matching items
- **WHEN** the current view matches zero items
- **THEN** the page SHALL show its empty state and SHALL NOT attempt to render any batch or scroll-loading indicator

### Requirement: Source attribution on every offer
Each displayed offer SHALL show which retailer it came from, alongside a reference to the retailer's own source page or file.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its retailer name and source attribution SHALL be visible without requiring further user interaction

### Requirement: Product image on offer card
Each displayed offer SHALL show its product image, resolved from whichever imagery its source provides — a direct image URL, or a crop of the leaflet page it was extracted from — and SHALL fall back to a placeholder tile when no image is available or the image fails to load, rather than collapsing the image area or showing a broken-image icon. The layout SHALL reserve the image's space before it loads, so that deferred loading does not shift the content around it.

#### Scenario: Offer has a populated image URL
- **WHEN** an offer is displayed whose `imageUrl` field is populated
- **THEN** the product image SHALL be visible on the offer card

#### Scenario: Offer has an image crop
- **WHEN** an offer is displayed that carries a crop referencing a leaflet page present in the same snapshot
- **THEN** only the cropped region of that page SHALL be visible on the card, scaled to the card's image area and not distorted

#### Scenario: Offer has no image of either kind
- **WHEN** an offer is displayed that carries neither a populated `imageUrl` nor a resolvable crop (e.g. a Lidl price-list offer, or a leaflet offer whose bounding box was discarded)
- **THEN** the card SHALL show a placeholder tile in the image area, and SHALL NOT show a broken-image icon or leave an empty gap in the layout

#### Scenario: Image fails to load
- **WHEN** an offer's image resource fails to load (broken link, network error)
- **THEN** the offer card SHALL fall back to the placeholder tile instead of showing a broken-image icon

#### Scenario: Images below the fold are deferred
- **WHEN** a list renders more offers than fit in the viewport
- **THEN** images outside the viewport SHALL be loaded only as they are approached, and their reserved space SHALL prevent the surrounding content from shifting when they arrive

### Requirement: Offer end date on offer card
Each displayed offer SHALL show the date its discount expires (`validUntil`), formatted as a human-readable date rather than a raw ISO timestamp.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its end date SHALL be visible on the card without requiring further user interaction

#### Scenario: End date formatting
- **WHEN** an offer's `validUntil` value is rendered
- **THEN** it SHALL be shown as a human-readable date (e.g. including a day, month, and year) rather than the raw ISO date string

### Requirement: ISR-served, no live scraping on request
Both the comparison view and the full offer listing SHALL be served via incremental static regeneration reading the cached snapshot; a page request SHALL NOT block on, or trigger, a live scrape or any classification work.

#### Scenario: Request during a stale cache window
- **WHEN** the cached snapshot is older than the expected time of the last scheduled sync window
- **THEN** the page SHALL still render the most recent available snapshot, including its comparison groups, rather than scraping live or returning an error
