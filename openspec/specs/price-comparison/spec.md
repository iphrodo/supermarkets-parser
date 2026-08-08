# price-comparison Specification

## Purpose

Normalizes offer quantities into comparable base units, assigns each offer a canonical product type, and builds cross-retailer comparison groups that identify the cheapest option per product type.

## Requirements

### Requirement: Quantity normalization to a comparable base unit
The system SHALL convert an offer's unit/quantity text into a base unit (kilogram, litre, or piece) and a quantity in that base unit, and SHALL treat an offer whose quantity cannot be determined as ineligible for comparison rather than assuming a quantity.

#### Scenario: Metric weight and volume text
- **WHEN** an offer's unit text expresses a weight or volume in Bulgarian units (e.g. "500 г", "1,5 л")
- **THEN** it SHALL be normalized to kilograms or litres respectively, accepting a comma as the decimal separator

#### Scenario: Multipack text
- **WHEN** an offer's unit text expresses a multipack (e.g. "4 x 125 г")
- **THEN** the normalized quantity SHALL be the total across the pack, not the size of a single item

#### Scenario: Multiple unit tokens in one text
- **WHEN** an offer's unit text contains several unit tokens for the same product (e.g. "3 л/ 1455 г")
- **THEN** the system SHALL deterministically select one of them and SHALL produce the same result regardless of the order in which the tokens appear

#### Scenario: Missing or unrecognized unit text
- **WHEN** an offer's unit text is empty or cannot be parsed into a known unit
- **THEN** the offer SHALL be excluded from comparison groups, and SHALL NOT be assigned a guessed quantity

### Requirement: Per-unit price accounts for promotional mechanics
The system SHALL derive a price per base unit for every comparable offer, and that price SHALL reflect the offer's `mechanic` so that multi-buy promotions compare fairly against plain discounts. Loyalty-tier pricing SHALL NOT be folded into the comparable price, since it is not available to every shopper.

#### Scenario: Multi-buy promotion
- **WHEN** an offer's mechanic is `buy_1_get_1_free` or `buy_2_get_1_free`
- **THEN** its per-unit price SHALL be reduced to the effective price actually paid per unit (half, and two thirds, respectively)

#### Scenario: Loyalty-gated price
- **WHEN** an offer's price requires a loyalty tier
- **THEN** the per-unit price SHALL NOT be silently treated as the general price, and the loyalty requirement SHALL remain visible on the comparison entry

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

### Requirement: Classification results are cached across syncs
The system SHALL persist canonical type assignments keyed by the date-free `productKey` and SHALL NOT re-classify an offer whose product was already classified in an earlier sync.

#### Scenario: Product reappears in a later week
- **WHEN** a product that was classified in an earlier sync reappears with a new discount period
- **THEN** it SHALL reuse its cached canonical type and SHALL NOT trigger a new classification request

#### Scenario: Sync with no new products
- **WHEN** a scheduled sync produces only products that already have cached assignments
- **THEN** no classification requests SHALL be issued for that sync

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

### Requirement: Cheapest option and savings are identified per group
Each published comparison group SHALL identify exactly one cheapest entry by per-unit price and SHALL express the potential saving between the cheapest and the most expensive entry.

#### Scenario: Group published
- **WHEN** a comparison group is published
- **THEN** exactly one of its entries SHALL be marked as cheapest, and the group SHALL carry the percentage difference between its lowest and highest per-unit price

#### Scenario: Group ordering
- **WHEN** multiple comparison groups are published
- **THEN** they SHALL be ordered by potential saving, largest first

### Requirement: Implausible prices are excluded, not published as savings
The system SHALL guard against extraction errors by excluding entries whose per-unit price is grossly out of line with the rest of their group, and SHALL record why rather than dropping them silently.

#### Scenario: Misread price from a vision source
- **WHEN** an entry's per-unit price exceeds ten times the median per-unit price of its group
- **THEN** that entry SHALL be excluded from the group and the exclusion SHALL be recorded in the group's warnings
