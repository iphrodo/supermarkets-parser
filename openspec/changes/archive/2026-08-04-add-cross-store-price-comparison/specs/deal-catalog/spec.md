## ADDED Requirements

### Requirement: Snapshot carries comparison groups by reference
The published snapshot SHALL include the comparison groups derived from its offers, and those groups SHALL reference offers by `offerKey` rather than embedding copies of offer records.

#### Scenario: Comparison group published alongside offers
- **WHEN** a snapshot containing comparison groups is published
- **THEN** every entry in every group SHALL reference an `offerKey` present in the same snapshot's offer list

#### Scenario: No duplication of offer data
- **WHEN** a comparison entry needs offer details for display (name, retailer badge, validity, source link)
- **THEN** those details SHALL be resolved from the snapshot's offer list rather than stored a second time inside the group

#### Scenario: Snapshot with no comparable products
- **WHEN** no product type in a snapshot has comparable offers from two or more retailers
- **THEN** the snapshot SHALL still be published, carrying an empty set of comparison groups rather than omitting the field
