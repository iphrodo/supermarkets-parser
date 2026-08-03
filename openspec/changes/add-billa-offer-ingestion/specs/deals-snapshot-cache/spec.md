## MODIFIED Requirements

### Requirement: Daily scheduled ingestion only
The system SHALL run Kaufland, Lidl, and Billa ingestion at most once per day via a scheduled job, consistent with the hosting plan's cron ceiling, and SHALL NOT trigger scraping in response to a user page request.

#### Scenario: User page view
- **WHEN** a user requests the deals page
- **THEN** the system SHALL read the last-built snapshot and SHALL NOT invoke any scraper

#### Scenario: Scheduled cron fires
- **WHEN** the daily cron trigger fires
- **THEN** the system SHALL run all three ingestion jobs and, on success, atomically replace the published snapshot

### Requirement: Partial-failure isolation between sources
If one or more sources' ingestion fails during a scheduled run, the system SHALL still publish a snapshot using the succeeding sources' fresh data plus each failed source's last known-good data, rather than failing the entire snapshot.

#### Scenario: One source fails, the others succeed
- **WHEN** Billa ingestion fails but Kaufland and Lidl ingestion succeed in the same scheduled run (or any other single-source failure)
- **THEN** the published snapshot SHALL contain fresh offers from the successful sources and the most recent successful offers from the failed source, each retaining its own `scrapedAt` so staleness is visible per source

### Requirement: No snapshot published on total failure
If all sources fail during a scheduled run, the system SHALL leave the previously published snapshot in place rather than publishing an empty catalog.

#### Scenario: All sources fail
- **WHEN** Kaufland, Lidl, and Billa ingestion all fail in the same scheduled run
- **THEN** the currently published snapshot SHALL remain unchanged and the failure SHALL be logged
