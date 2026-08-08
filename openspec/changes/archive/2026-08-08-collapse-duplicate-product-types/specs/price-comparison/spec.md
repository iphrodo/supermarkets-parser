## ADDED Requirements

### Requirement: The canonical type vocabulary holds no duplicate types
The vocabulary SHALL NOT contain two canonical types sharing both a label and a base unit. The system SHALL maintain this itself rather than relying on the classification step to avoid proposing a duplicate, and SHALL merge types already duplicated during a subsequent scheduled sync without re-classifying the products assigned to them. A failure to merge SHALL NOT prevent the snapshot from being published.

This strengthens the existing reuse expectation: where two types would be indistinguishable to a reader — same label, same base unit — reuse stops being a preference and becomes an invariant.

#### Scenario: Classification proposes a type that already exists
- **WHEN** classification proposes a new canonical type whose label and base unit match a type already in the vocabulary
- **THEN** the existing type SHALL be reused for that offer, and no second type SHALL be added

#### Scenario: Proposed type shares a label but not a base unit
- **WHEN** classification proposes a new canonical type whose label matches an existing type but whose base unit differs
- **THEN** a separate type SHALL be created, since offers measured in different base units cannot be compared within one group

#### Scenario: Vocabulary contains duplicate types
- **WHEN** a scheduled sync finds two or more canonical types sharing a label and a base unit
- **THEN** they SHALL be reduced to one, every product assigned to a removed type SHALL be reassigned to the surviving one, and no classification request SHALL be issued for those products

#### Scenario: Merging requires no judgement about meaning
- **WHEN** types are merged
- **THEN** only types whose labels are identical SHALL be combined, and types whose labels merely resemble one another SHALL be left alone, since wrongly merging two distinct kinds of product silently destroys a comparison

#### Scenario: Vocabulary holds no duplicates
- **WHEN** a scheduled sync finds no two types sharing a label and a base unit
- **THEN** the vocabulary and the product assignments SHALL be left unchanged

#### Scenario: Merging fails
- **WHEN** merging duplicate types fails during a sync
- **THEN** the failure SHALL be logged, the vocabulary and assignments SHALL be left as they were, the merge SHALL be retried on a later sync, and the snapshot SHALL still be published

#### Scenario: Offers of a merged type are compared together
- **WHEN** a product kind was split across duplicate types and those types are merged
- **THEN** its offers SHALL afterwards form a single comparison group covering every participating retailer, rather than several groups each covering a subset
