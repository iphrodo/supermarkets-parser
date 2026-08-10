## ADDED Requirements

### Requirement: Offers carry a resolved department
Every offer published in the snapshot SHALL carry the department of its canonical product type, resolved the same way a comparison group's department is resolved, regardless of whether that offer's product type ends up in a published comparison group. An offer whose product type cannot be resolved SHALL carry the catch-all department rather than being left without one.

#### Scenario: Offer's product type is classified
- **WHEN** a snapshot is published and an offer's `productKey` resolves to a canonical product type with a department
- **THEN** the offer's `department` SHALL be that department

#### Scenario: Offer has no comparison group
- **WHEN** an offer's canonical product type has comparable offers from only one retailer, so no comparison group is published for it
- **THEN** the offer SHALL still carry its resolved `department`, independent of comparison-group publication

#### Scenario: Offer's product type cannot be resolved
- **WHEN** a snapshot is published and an offer's `productKey` has no classification assignment, or its assigned type has no recorded department
- **THEN** the offer's `department` SHALL be the catch-all department

#### Scenario: Classification enrichment fails during a sync
- **WHEN** a scheduled sync fails to complete classification/enrichment and degrades to the previous snapshot's comparison groups
- **THEN** each offer published in that sync SHALL carry the department its same `offerKey` carried in the previous snapshot, when one exists, and SHALL carry the catch-all department otherwise

#### Scenario: Snapshot cached before this field existed
- **WHEN** a snapshot published before offers carried a `department` is read
- **THEN** consumers SHALL treat an offer with no `department` as the catch-all department rather than failing or omitting the offer
