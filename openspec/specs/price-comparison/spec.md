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
The system SHALL assign every offer a canonical product type derived from its name, describing a generic kind of product independent of brand and pack size, without requiring a user or maintainer to select products manually.

#### Scenario: Equivalent products from different retailers
- **WHEN** two retailers offer the same kind of product under different names and brands
- **THEN** both SHALL be assigned the same canonical product type

#### Scenario: Type vocabulary is reused, not reinvented
- **WHEN** an offer is classified and an existing canonical type already describes its kind of product
- **THEN** that existing type SHALL be reused rather than a near-duplicate type being created

#### Scenario: Low-confidence classification
- **WHEN** the system cannot confidently assign a canonical type to an offer
- **THEN** that offer SHALL be left unassigned and excluded from comparison, rather than being placed in a guessed type

### Requirement: Classification results are cached across syncs
The system SHALL persist canonical type assignments keyed by the date-free `productKey` and SHALL NOT re-classify an offer whose product was already classified in an earlier sync.

#### Scenario: Product reappears in a later week
- **WHEN** a product that was classified in an earlier sync reappears with a new discount period
- **THEN** it SHALL reuse its cached canonical type and SHALL NOT trigger a new classification request

#### Scenario: Sync with no new products
- **WHEN** a scheduled sync produces only products that already have cached assignments
- **THEN** no classification requests SHALL be issued for that sync

### Requirement: Cross-retailer comparison groups
The system SHALL build comparison groups from offers sharing a canonical product type, SHALL represent each retailer at most once per group using that retailer's cheapest comparable offer, and SHALL only publish groups covering at least two distinct retailers.

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
