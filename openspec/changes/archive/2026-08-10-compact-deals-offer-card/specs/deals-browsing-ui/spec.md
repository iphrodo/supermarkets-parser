## ADDED Requirements

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
