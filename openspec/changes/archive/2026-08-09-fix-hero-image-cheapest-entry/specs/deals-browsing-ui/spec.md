## MODIFIED Requirements

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
