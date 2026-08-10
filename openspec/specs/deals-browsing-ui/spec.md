# deals-browsing-ui Specification

## Purpose

Presents the cached deal catalog to the end user as a single filterable page, always reading from the pre-built snapshot and never triggering live scraping from a page request.

## Requirements

### Requirement: Price comparison is the landing view
The landing page SHALL present cross-retailer price comparisons rather than the flat offer list, showing for each canonical product type the participating retailers' per-unit prices with the cheapest one visually distinguished. Each comparison SHALL lead with a product image and a price, so that what is being compared and what it costs are both apparent without reading secondary text. The image SHALL depict the offer the comparison's headline prices whenever that offer has usable imagery of any kind, since the image and the headline price are read as one statement about one product.

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
- **WHEN** a comparison group is displayed and its cheapest entry has usable imagery
- **THEN** the group's image SHALL be that entry's own imagery, whether it is a direct product photograph or a leaflet crop, so the pictured product is the one the headline price refers to

#### Scenario: The cheapest entry has no usable imagery
- **WHEN** a comparison group is displayed whose cheapest entry has neither a direct product photograph nor a resolvable leaflet crop, while another entry does
- **THEN** the group's image SHALL be taken from another entry, preferring a direct product photograph over a leaflet crop

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

### Requirement: Compact horizontal offer card layout
Each card in the full offer listing SHALL arrange its product image beside its text content in a single horizontal row, rather than stacking the image above the text, so that a card's height stays bounded regardless of how much text content it carries and more offers are visible per screen without scrolling. This layout change SHALL NOT remove or hide any field otherwise required to be shown on the card (retailer, discount percentage, product image, brand, name, unit text, price, original price, loyalty and mechanic badges, purchase limit, end date, category, and source attribution) — every field required elsewhere in this capability SHALL still be present and readable on the card.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the full listing
- **THEN** its product image SHALL appear beside its text content in the same row, not above it, and the card's total height SHALL scale with the amount of text content rather than with a full-width image

#### Scenario: Offer with sparse content
- **WHEN** an offer being displayed has no brand, no discount, no loyalty or mechanic badge, and no purchase limit
- **THEN** the card SHALL NOT leave empty vertical gaps where those fields would have been, and its height SHALL shrink accordingly

#### Scenario: Offer with a long product name
- **WHEN** an offer's product name is long enough to wrap onto multiple lines
- **THEN** the name SHALL wrap within the text column beside the image rather than overflowing the card or overlapping the image

### Requirement: ISR-served, no live scraping on request
Both the comparison view and the full offer listing SHALL be served via incremental static regeneration reading the cached snapshot; a page request SHALL NOT block on, or trigger, a live scrape or any classification work.

#### Scenario: Request during a stale cache window
- **WHEN** the cached snapshot is older than the expected time of the last scheduled sync window
- **THEN** the page SHALL still render the most recent available snapshot, including its comparison groups, rather than scraping live or returning an error
