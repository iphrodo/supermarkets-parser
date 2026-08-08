## MODIFIED Requirements

### Requirement: Product image on offer card
Each displayed offer SHALL show its product image, resolved from whichever imagery its source provides — a direct image URL, or a crop of the leaflet page it was extracted from — and SHALL fall back to a placeholder tile when no image is available or the image fails to load, rather than collapsing the image area or showing a broken-image icon. The layout SHALL reserve the image's space before it loads, so that deferred loading does not shift the content around it.

#### Scenario: Offer has a populated image URL
- **WHEN** an offer is displayed whose `imageUrl` field is populated
- **THEN** the product image SHALL be visible on the offer card

#### Scenario: Offer has an image crop
- **WHEN** an offer is displayed that carries a crop referencing a leaflet page present in the same snapshot
- **THEN** only the cropped region of that page SHALL be visible on the card, scaled to the card's image area and not distorted

#### Scenario: Offer has no image of either kind
- **WHEN** an offer is displayed that carries neither a populated `imageUrl` nor a resolvable crop (e.g. a Lidl price-list offer, or a leaflet offer whose bounding box was discarded)
- **THEN** the card SHALL show a placeholder tile in the image area, and SHALL NOT show a broken-image icon or leave an empty gap in the layout

#### Scenario: Image fails to load
- **WHEN** an offer's image resource fails to load (broken link, network error)
- **THEN** the offer card SHALL fall back to the placeholder tile instead of showing a broken-image icon

#### Scenario: Images below the fold are deferred
- **WHEN** a list renders more offers than fit in the viewport
- **THEN** images outside the viewport SHALL be loaded only as they are approached, and their reserved space SHALL prevent the surrounding content from shifting when they arrive
