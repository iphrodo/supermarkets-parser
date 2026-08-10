## MODIFIED Requirements

### Requirement: Filterable listing
The full offer listing SHALL remain available on its own route, reachable from the landing view, and SHALL let the user filter offers by retailer, department, and price. The department filter SHALL offer only the fixed department taxonomy, in canonical department order, restricted to departments actually present among the currently loaded offers — never a raw per-retailer category value. Filtering SHALL operate over the full set of matching offers even though only an initial batch is rendered at a time.

#### Scenario: Reaching the full listing
- **WHEN** a user follows the navigation from the comparison view to the full offer list
- **THEN** the full filterable offer listing SHALL be shown with its filtering and incremental-scroll behavior unchanged

#### Scenario: Filter by retailer
- **WHEN** the user selects a single retailer filter (e.g. "Lidl")
- **THEN** only offers from that retailer SHALL be shown

#### Scenario: Department options reflect the canonical taxonomy
- **WHEN** the department filter is rendered
- **THEN** its options SHALL be the fixed department set with their Bulgarian labels, ordered by canonical department order, and SHALL NOT include raw per-retailer category text or numeric codes

#### Scenario: Filter by department
- **WHEN** the user selects a department
- **THEN** only offers whose resolved department matches the selection SHALL be shown, including offers whose department is the catch-all when the catch-all is selected

#### Scenario: Offer with no resolved department
- **WHEN** an offer carries no `department` (e.g. from a snapshot cached before this field existed)
- **THEN** it SHALL be treated as belonging to the catch-all department for filtering and for the option list, rather than being hidden or crashing the page

#### Scenario: Combined filters
- **WHEN** the user selects a retailer, a department, and a price range together
- **THEN** only offers matching all three criteria SHALL be shown

#### Scenario: Changing filters resets the visible batch
- **WHEN** the user changes any filter (retailer, department, or price) while additional offers from the previous filter selection are still unrendered below the fold
- **THEN** the visible list SHALL be replaced by the first batch of offers matching the new filters, discarding any previously rendered batch state
