## MODIFIED Requirements

### Requirement: Price comparison is the landing view
The landing page SHALL present cross-retailer price comparisons rather than the flat offer list, showing for each canonical product type the participating retailers' per-unit prices with the cheapest one visually distinguished. Each comparison SHALL lead with a product image and a price, so that what is being compared and what it costs are both apparent without reading secondary text.

#### Scenario: Landing page load
- **WHEN** a user opens the site root
- **THEN** comparison groups SHALL be rendered, ordered by potential saving, each showing one row per retailer with its price per base unit and the cheapest row marked

#### Scenario: No comparison groups available
- **WHEN** the published snapshot contains no comparison groups
- **THEN** the page SHALL show an explicit empty state explaining that no product is currently on offer in two or more stores, rather than an empty screen

#### Scenario: Comparison entries are traceable to their offers
- **WHEN** a comparison entry is displayed
- **THEN** the underlying offer's product name, pack size, and retailer SHALL be visible, so the user can see what is being compared

#### Scenario: Comparison carries a product image
- **WHEN** a comparison group is displayed and at least one of its offers has usable imagery
- **THEN** a product image SHALL be shown for the group, preferring a direct product photograph over a leaflet crop and, among equivalent candidates, the cheapest entry's offer

#### Scenario: No offer in the group has an image
- **WHEN** a comparison group is displayed and none of its offers has usable imagery
- **THEN** a placeholder tile SHALL be shown in the image area, and the layout SHALL NOT collapse or leave an empty gap

#### Scenario: Saving is expressed in both relative and absolute terms
- **WHEN** a comparison group with a non-zero saving is displayed
- **THEN** the saving SHALL be stated both as a percentage and as an absolute amount per base unit, since a percentage alone is misleading on inexpensive goods and an absolute amount alone is misleading on expensive ones

#### Scenario: Price is the dominant element
- **WHEN** a comparison group is displayed
- **THEN** the cheapest per-unit price SHALL be the most visually prominent element of the comparison, with the corresponding pack price also shown, and secondary metadata SHALL NOT compete with it for attention

#### Scenario: Retailer rows are ordered by price
- **WHEN** a comparison group with more than two retailers is displayed
- **THEN** its retailer rows SHALL be ordered from cheapest to most expensive per base unit

### Requirement: Comparison entry links to its source
Every comparison entry SHALL expose a link to its offer's `sourceUrl`, opening in a new tab, for every retailer in the group and not only the cheapest one. The link SHALL be reachable from the comparison without navigating away from the landing view, but SHALL NOT be required to sit on the comparison card itself.

#### Scenario: Source link reachable for every retailer
- **WHEN** a user inspects a comparison group's details
- **THEN** a link to each participating retailer's offer `sourceUrl` SHALL be available and SHALL open in a new tab, for every retailer row in the group

#### Scenario: Reaching a source link does not leave the page
- **WHEN** a user wants an entry's source link from the landing view
- **THEN** it SHALL be reachable through an interaction on that comparison, without a navigation to a separate page

### Requirement: Comparison entry shows its EAN when available
A comparison entry's EAN SHALL be shown when the underlying offer has one, and SHALL be reachable from the comparison without navigating away from the landing view, but SHALL NOT be required to sit on the comparison card itself.

#### Scenario: Comparison entry has an EAN
- **WHEN** a user inspects a comparison group's details and an entry's underlying offer has a non-null `ean`
- **THEN** the EAN code SHALL be visible for that entry

#### Scenario: Comparison entry has no EAN
- **WHEN** an entry's underlying offer has `ean: null`
- **THEN** no EAN code SHALL be shown for that entry, and no empty placeholder or stray separator SHALL be left in its place

## ADDED Requirements

### Requirement: Comparison results are narrowable
The comparison view SHALL let the user narrow the published groups by department, by retailer, by a minimum saving, and by free-text search, and SHALL make the effect of the active narrowing visible rather than leaving a short list unexplained.

#### Scenario: Search covers products, not only type labels
- **WHEN** the user types a search term
- **THEN** groups SHALL match on their canonical type label and on the names and brands of their underlying offers, so searching for a brand finds the comparisons it appears in

#### Scenario: Filter by department
- **WHEN** the user selects a department
- **THEN** only groups belonging to that department SHALL be shown, and selecting the already-active department SHALL clear the filter

#### Scenario: Department counts reflect the current search
- **WHEN** a search term is active and departments are offered for selection
- **THEN** each department's count SHALL be computed over the search-filtered groups, and a department with no matching groups SHALL NOT be offered

#### Scenario: Filter by several retailers at once
- **WHEN** the user selects more than one retailer
- **THEN** a group SHALL be shown when any of its entries comes from a selected retailer

#### Scenario: Filter by minimum saving
- **WHEN** the user selects a minimum saving threshold
- **THEN** only groups whose saving meets or exceeds that threshold SHALL be shown

#### Scenario: Combined narrowing
- **WHEN** the user combines a search term, a department, a retailer selection, and a minimum saving
- **THEN** only groups satisfying all of them SHALL be shown

#### Scenario: Active narrowing is visible and reversible
- **WHEN** any narrowing is active
- **THEN** the view SHALL show an overview of what is currently applied, SHALL allow removing each one individually and all of them at once, and SHALL show how many groups are shown out of how many exist

#### Scenario: Changing narrowing resets the visible batch
- **WHEN** the user changes any search term, department, retailer selection, minimum saving, or ordering while additional groups from the previous selection are still unrendered below the fold
- **THEN** the visible list SHALL be replaced by the first batch of groups matching the new selection, discarding any previously rendered batch state

#### Scenario: Narrowing yields nothing
- **WHEN** the active narrowing matches no groups
- **THEN** the view SHALL show an empty state alongside the still-visible overview of what is applied, so the user can see why nothing matched

#### Scenario: Departments unavailable in the data
- **WHEN** no published group carries a department
- **THEN** department selection SHALL be omitted from the view entirely rather than presented as a single degenerate choice

### Requirement: Comparison view state is shareable
The comparison view's active narrowing, ordering, and open details view SHALL be reflected in the page URL, so that a view a user reaches is a view they can share and return to.

#### Scenario: Narrowing is reflected in the URL
- **WHEN** the user changes any search term, department, retailer selection, minimum saving, or ordering
- **THEN** the URL SHALL be updated to reflect it, without adding an intermediate history entry per change

#### Scenario: Opening a shared URL
- **WHEN** a user opens a URL carrying narrowing or ordering state
- **THEN** the view SHALL restore that state

#### Scenario: Defaults are not written to the URL
- **WHEN** a filter or ordering is at its default value
- **THEN** it SHALL be absent from the URL, so an unnarrowed view has a clean address

#### Scenario: Back closes the details view without discarding narrowing
- **WHEN** the user opens a comparison's details view and then navigates back
- **THEN** the details view SHALL close and the narrowing that was active SHALL remain applied

#### Scenario: Opening a details URL directly
- **WHEN** a user opens a URL that identifies an open details view before the snapshot has loaded
- **THEN** the view SHALL render once the data is available rather than failing, and an identifier matching no published group SHALL leave the underlying list usable

### Requirement: Comparison details view
Each comparison SHALL offer a details view, opened from the comparison itself, presenting every participating retailer's offer in full and surfacing the warnings recorded for the group and for each of its underlying offers.

#### Scenario: Opening details from a comparison
- **WHEN** the user activates a comparison
- **THEN** a details view for that group SHALL open without a full page navigation

#### Scenario: Per-entry detail
- **WHEN** the details view is shown
- **THEN** each entry SHALL present its own product image, retailer, brand, full product name, pack size, validity period, per-unit price and pack price, and — where present — its EAN, original price, promotional mechanic, and loyalty requirement

#### Scenario: An entry's offer has no original price
- **WHEN** an entry's underlying offer has `originalPriceEurCents: null`
- **THEN** no struck-through price SHALL be shown for that entry, and no empty placeholder or stray separator SHALL be left in its place

#### Scenario: Group warnings are surfaced
- **WHEN** a group carries warnings recorded while it was built (for example an entry excluded for an implausible per-unit price)
- **THEN** those warnings SHALL be shown in the details view rather than discarded

#### Scenario: Per-offer warnings are surfaced
- **WHEN** an entry's underlying offer carries warnings recorded during ingestion (for example a discount its source could not quantify)
- **THEN** those warnings SHALL be shown with that entry, attributable to it rather than to the group as a whole

#### Scenario: An entry's offer has no warnings
- **WHEN** an entry's underlying offer carries no warnings
- **THEN** no warnings area SHALL be rendered for that entry

#### Scenario: Dismissing the details view
- **WHEN** the details view is open
- **THEN** it SHALL be dismissable by an explicit close action and by the keyboard, returning focus to the page beneath

### Requirement: Bulgarian user interface
All user-facing text SHALL be presented in Bulgarian across the comparison view, the offer listing, and the shared navigation, matching the language of the product data itself.

#### Scenario: Any page rendered
- **WHEN** any page of the site is rendered
- **THEN** its headings, controls, badges, empty states, and loading and end-of-list messages SHALL be in Bulgarian

#### Scenario: Mixed-language shell
- **WHEN** a page other than the comparison view is reached through the shared navigation
- **THEN** it SHALL also be in Bulgarian, so no route presents a partly translated interface
