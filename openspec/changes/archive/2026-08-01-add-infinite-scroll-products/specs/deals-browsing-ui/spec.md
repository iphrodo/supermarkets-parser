## MODIFIED Requirements

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

## ADDED Requirements

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
