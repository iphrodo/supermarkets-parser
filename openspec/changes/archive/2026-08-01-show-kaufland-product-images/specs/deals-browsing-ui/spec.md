## ADDED Requirements

### Requirement: Product image on offer card
Each displayed offer SHALL show its product image when the offer's `imageUrl` field is populated, and SHALL render without an image area when no image is available or the image fails to load.

#### Scenario: Offer has a populated image URL
- **WHEN** an offer is displayed whose `imageUrl` field is populated
- **THEN** the product image SHALL be visible on the offer card

#### Scenario: Offer has no image URL
- **WHEN** an offer is displayed whose `imageUrl` field is null, or whose schema has no `imageUrl` field at all (e.g. a Lidl offer)
- **THEN** the offer card SHALL render without an image area, and SHALL NOT show a broken-image placeholder or leave an empty gap in the layout

#### Scenario: Image fails to load
- **WHEN** an offer's `imageUrl` is populated but the image resource fails to load (broken link, network error)
- **THEN** the offer card SHALL fall back to the no-image layout instead of showing a broken-image icon
