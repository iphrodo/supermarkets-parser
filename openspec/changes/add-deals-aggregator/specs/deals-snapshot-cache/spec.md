## Purpose

Decouples scraping from user traffic by running both ingestion jobs on a daily schedule and serving pre-built snapshots to every page request, so no visitor ever triggers a live scrape.

## ADDED Requirements

### Requirement: Daily scheduled ingestion only
The system SHALL run Kaufland and Lidl ingestion at most once per day via a scheduled job, consistent with the hosting plan's cron ceiling, and SHALL NOT trigger scraping in response to a user page request.

#### Scenario: User page view
- **WHEN** a user requests the deals page
- **THEN** the system SHALL read the last-built snapshot and SHALL NOT invoke either scraper

#### Scenario: Scheduled cron fires
- **WHEN** the daily cron trigger fires
- **THEN** the system SHALL run both ingestion jobs and, on success, atomically replace the published snapshot

### Requirement: Durable cross-invocation storage
Snapshots SHALL be persisted in external storage that survives serverless cold starts, not the runtime's default in-memory cache.

#### Scenario: Cold start after previous instance recycled
- **WHEN** a new serverless instance handles a request after a prior instance was recycled
- **THEN** it SHALL still be able to read the most recently published snapshot

### Requirement: Partial-failure isolation between sources
If one source's ingestion fails during a scheduled run, the system SHALL still publish a snapshot using the other source's fresh data plus the failed source's last known-good data, rather than failing the entire snapshot.

#### Scenario: One source fails, the other succeeds
- **WHEN** Kaufland ingestion fails but Lidl ingestion succeeds in the same scheduled run (or vice versa)
- **THEN** the published snapshot SHALL contain fresh offers from the successful source and the most recent successful offers from the failed source, each retaining its own `scrapedAt` so staleness is visible per source

### Requirement: No snapshot published on total failure
If both sources fail during a scheduled run, the system SHALL leave the previously published snapshot in place rather than publishing an empty catalog.

#### Scenario: Both sources fail
- **WHEN** both Kaufland and Lidl ingestion fail in the same scheduled run
- **THEN** the currently published snapshot SHALL remain unchanged and the failure SHALL be logged
