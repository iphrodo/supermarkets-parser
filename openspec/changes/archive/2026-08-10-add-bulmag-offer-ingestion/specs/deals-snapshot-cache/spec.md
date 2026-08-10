## MODIFIED Requirements

### Requirement: Twice-weekly scheduled ingestion only
The system SHALL run Kaufland, Lidl (price-list), Lidl (product listing), Billa, and BulMag ingestion at most around each of the two weekly sync windows (Monday and Thursday, 10:00 Kyiv time), and SHALL NOT trigger scraping in response to a user page request. Since the server is not kept running continuously, the system SHALL catch up a missed window on the next server start rather than requiring the window to be hit exactly.

#### Scenario: User page view
- **WHEN** a user requests the deals page
- **THEN** the system SHALL read the last-built snapshot and SHALL NOT invoke any scraper

#### Scenario: Server starts during or after a sync window
- **WHEN** the server starts and the most recently elapsed Monday/Thursday 10:00 Kyiv sync window is newer than the published snapshot's `generatedAt`
- **THEN** the system SHALL run all five ingestion sources immediately and, on success, atomically replace the published snapshot

#### Scenario: Server starts with no missed window
- **WHEN** the server starts and the published snapshot's `generatedAt` is already newer than the most recently elapsed sync window
- **THEN** the system SHALL NOT run ingestion
