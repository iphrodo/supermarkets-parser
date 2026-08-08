## MODIFIED Requirements

### Requirement: Automatic canonical product-type assignment
The system SHALL assign every offer a canonical product type derived from its name, describing a generic kind of product independent of brand and pack size, without requiring a user or maintainer to select products manually. Every canonical type SHALL additionally carry exactly one department, identifying the supermarket aisle the type belongs to, so that types can be grouped for navigation.

#### Scenario: Equivalent products from different retailers
- **WHEN** two retailers offer the same kind of product under different names and brands
- **THEN** both SHALL be assigned the same canonical product type

#### Scenario: Type vocabulary is reused, not reinvented
- **WHEN** an offer is classified and an existing canonical type already describes its kind of product
- **THEN** that existing type SHALL be reused rather than a near-duplicate type being created

#### Scenario: Low-confidence classification
- **WHEN** the system cannot confidently assign a canonical type to an offer
- **THEN** that offer SHALL be left unassigned and excluded from comparison, rather than being placed in a guessed type

#### Scenario: New type is created with a department
- **WHEN** a new canonical type is added to the vocabulary
- **THEN** it SHALL be recorded with exactly one department alongside its labels and base unit

#### Scenario: Reused type inherits its department
- **WHEN** an offer is assigned an existing canonical type
- **THEN** it SHALL take that type's recorded department, and no department decision SHALL be required for that offer

#### Scenario: Department cannot be determined
- **WHEN** a type's department cannot be determined
- **THEN** the type SHALL be recorded under the catch-all department rather than being left without one or dropped from the vocabulary, since an unclassifiable aisle must never cost a comparison group

### Requirement: Cross-retailer comparison groups
The system SHALL build comparison groups from offers sharing a canonical product type, SHALL represent each retailer at most once per group using that retailer's cheapest comparable offer, and SHALL only publish groups covering at least two distinct retailers. Each published group SHALL carry its canonical type's department.

#### Scenario: One retailer promotes several products of the same type
- **WHEN** a retailer has multiple comparable offers within one canonical type
- **THEN** the group SHALL contain a single entry for that retailer, representing its lowest per-unit price

#### Scenario: Two sources share one retailer
- **WHEN** offers from the Lidl price-list source and the Lidl product-listing source fall into the same canonical type
- **THEN** they SHALL be reduced to one Lidl entry, and SHALL NOT be presented as two retailers being compared

#### Scenario: Only one retailer offers a product type
- **WHEN** a canonical type contains comparable offers from only one retailer
- **THEN** no comparison group SHALL be published for that type

#### Scenario: Mismatched base unit within a type
- **WHEN** an offer's base unit disagrees with its canonical type's base unit
- **THEN** it SHALL be excluded from that group rather than compared across incompatible units

#### Scenario: Group carries its department
- **WHEN** a comparison group is published
- **THEN** it SHALL carry the department of the canonical type it was built from, so consumers can group and count groups by department without resolving the type vocabulary

## ADDED Requirements

### Requirement: Departments are a closed taxonomy
The set of departments SHALL be fixed in the system rather than proposed or extended by the classifier, and SHALL include a catch-all member. A department value outside the fixed set SHALL be coerced to the catch-all and SHALL NOT be persisted.

#### Scenario: Classifier returns an unknown department
- **WHEN** classification returns a department that is not a member of the fixed set
- **THEN** the type SHALL still be created, recorded under the catch-all department, and the unknown value SHALL NOT be persisted or added to the taxonomy

#### Scenario: Taxonomy is not grown by classification
- **WHEN** classification runs repeatedly over many syncs
- **THEN** the set of departments SHALL remain exactly the fixed set, even though the canonical type vocabulary itself continues to grow

#### Scenario: Every department is presentable
- **WHEN** a department is recorded on a type
- **THEN** it SHALL have a human-readable Bulgarian label available for display, with no department reachable that lacks one

### Requirement: Existing types acquire departments without re-classification
Canonical types persisted before departments existed SHALL be assigned a department during a subsequent scheduled sync, without re-classifying the offers already assigned to them, and a failure of that assignment SHALL NOT prevent the snapshot from being published.

#### Scenario: Vocabulary predates departments
- **WHEN** a scheduled sync finds canonical types in the vocabulary that carry no department
- **THEN** the system SHALL assign each of them a department and persist the updated vocabulary, without issuing any new classification request for the products already assigned to those types

#### Scenario: Every type already has a department
- **WHEN** a scheduled sync finds no type lacking a department
- **THEN** no assignment requests SHALL be issued for that sync

#### Scenario: Assignment fails for part of the vocabulary
- **WHEN** assigning departments fails for some types during a sync
- **THEN** the remaining types SHALL keep the departments they have, the failure SHALL be logged, the affected types SHALL be retried on a later sync, and the snapshot SHALL still be published

#### Scenario: Cached product assignments are untouched
- **WHEN** departments are assigned to existing types
- **THEN** the cached mapping from products to canonical types SHALL remain unchanged, so no product is reclassified as a side effect
