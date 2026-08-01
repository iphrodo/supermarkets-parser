## MODIFIED Requirements

### Requirement: Extract EAN from product image URL
When a product tile's image URL contains a numeric barcode-like segment (e.g. `.../8606018614950_BG_P`), the system SHALL extract it into an `ean` field on the offer. Regardless of whether a barcode segment is found, the system SHALL also populate the offer's `imageUrl` field with the tile's raw image URL.

#### Scenario: Barcode present in image URL
- **WHEN** the image URL contains a numeric segment matching an EAN-13 pattern
- **THEN** the system SHALL populate `ean` with that value
- **AND** the system SHALL populate `imageUrl` with the full image URL

#### Scenario: No barcode segment found
- **WHEN** the image URL does not contain a recognizable barcode segment
- **THEN** `ean` SHALL be null
- **AND** the system SHALL still populate `imageUrl` with the full image URL

#### Scenario: Tile has no image URL
- **WHEN** a product tile's raw data has no image URL at all
- **THEN** both `ean` and `imageUrl` SHALL be null
