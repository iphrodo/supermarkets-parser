## ADDED Requirements

### Requirement: Offer end date on offer card
Each displayed offer SHALL show the date its discount expires (`validUntil`), formatted as a human-readable date rather than a raw ISO timestamp.

#### Scenario: Offer card rendered
- **WHEN** an offer is displayed in the list
- **THEN** its end date SHALL be visible on the card without requiring further user interaction

#### Scenario: End date formatting
- **WHEN** an offer's `validUntil` value is rendered
- **THEN** it SHALL be shown as a human-readable date (e.g. including a day, month, and year) rather than the raw ISO date string
