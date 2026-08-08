## MODIFIED Requirements

### Requirement: Partial-failure isolation between sources
If one or more sources' ingestion fails during a scheduled run, the system SHALL still publish a snapshot using the succeeding sources' fresh data plus each failed source's last known-good data, rather than failing the entire snapshot. Since more than one source can share the same retailer identifier (e.g. Lidl's price-list and product-listing sources both tag offers with the same retailer), the system SHALL identify each source's own previously published offers by a means that distinguishes it from any other source sharing that retailer identifier, so that a failure in one such source never incorrectly resurrects another, still-succeeding source's stale offers. The set of sources SHALL be treated as a configuration of the sync rather than a fixed list, so that adding or removing a source does not alter this isolation behavior.

#### Scenario: One source fails, the others succeed
- **WHEN** Billa ingestion fails but the other sources succeed in the same scheduled run (or any other single-source failure)
- **THEN** the published snapshot SHALL contain fresh offers from the successful sources and the most recent successful offers from the failed source, each retaining its own `scrapedAt` so staleness is visible per source

#### Scenario: One of two same-retailer sources fails
- **WHEN** the Lidl product-listing source fails but the Lidl price-list source succeeds in the same scheduled run (or vice versa)
- **THEN** the published snapshot SHALL contain the succeeding Lidl source's fresh offers and the failed Lidl source's last known-good offers, and SHALL NOT also reintroduce the succeeding source's own stale previous offers alongside its fresh ones

#### Scenario: Previously published snapshot predates a source change
- **WHEN** the most recently published snapshot was written before a source was added, removed, or renamed, and so carries no per-source status for a source the current run knows about
- **THEN** the run SHALL treat that source as having no last known-good data rather than failing to read the snapshot, so that carry-forward for the remaining sources still works

#### Scenario: A removed source's leftover data is not carried forward
- **WHEN** the previously published snapshot contains offers, and leaflet pages, belonging to a source that no longer exists
- **THEN** those offers SHALL NOT be carried into the new snapshot, and any leaflet pages they alone referenced SHALL be pruned before publication

### Requirement: No snapshot published on total failure
If all sources fail during a scheduled run, the system SHALL leave the previously published snapshot in place rather than publishing an empty catalog.

#### Scenario: All sources fail
- **WHEN** every configured source fails in the same scheduled run
- **THEN** the currently published snapshot SHALL remain unchanged and the failure SHALL be logged
