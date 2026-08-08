## MODIFIED Requirements

### Requirement: Partial-failure isolation between sources
If one or more sources' ingestion fails during a scheduled run, the system SHALL still publish a snapshot using the succeeding sources' fresh data plus each failed source's last known-good data, rather than failing the entire snapshot. Since more than one source can share the same retailer identifier (e.g. Lidl's price-list and leaflet sources both tag offers with the same retailer), the system SHALL identify each source's own previously published offers by a means that distinguishes it from any other source sharing that retailer identifier, so that a failure in one such source never incorrectly resurrects another, still-succeeding source's stale offers. Where a source's offers reference shared resources published alongside them — such as the leaflet pages their image crops point at — carrying those offers forward SHALL also carry forward the resources they reference.

#### Scenario: One source fails, the others succeed
- **WHEN** Billa ingestion fails but the other three sources succeed in the same scheduled run (or any other single-source failure)
- **THEN** the published snapshot SHALL contain fresh offers from the successful sources and the most recent successful offers from the failed source, each retaining its own `scrapedAt` so staleness is visible per source

#### Scenario: One of two same-retailer sources fails
- **WHEN** the Lidl leaflet source fails but the Lidl price-list source succeeds in the same scheduled run (or vice versa)
- **THEN** the published snapshot SHALL contain the succeeding Lidl source's fresh offers and the failed Lidl source's last known-good offers, and SHALL NOT also reintroduce the succeeding source's own stale previous offers alongside its fresh ones

#### Scenario: A failed leaflet source's pages are carried forward with its offers
- **WHEN** a leaflet source fails and its last known-good offers are carried forward
- **THEN** the leaflet pages those offers' image crops reference SHALL be carried forward with them, so no carried-forward crop points at a page absent from the published snapshot

#### Scenario: A succeeding source's pages are not resurrected
- **WHEN** one leaflet source fails and another succeeds in the same run
- **THEN** only the failed source's pages SHALL be carried forward, and the succeeding source's superseded pages SHALL NOT be reintroduced alongside its fresh ones
