## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: ISR-served, no live scraping on request
Both the comparison view and the full offer listing SHALL be served via incremental static regeneration reading the cached snapshot; a page request SHALL NOT block on, or trigger, a live scrape or any classification work.

#### Scenario: Request during a stale cache window
- **WHEN** the cached snapshot is older than the expected time of the last scheduled sync window
- **THEN** the page SHALL still render the most recent available snapshot, including its comparison groups, rather than scraping live or returning an error
