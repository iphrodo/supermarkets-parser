## MODIFIED Requirements

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
