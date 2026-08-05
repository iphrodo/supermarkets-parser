## ADDED Requirements

### Requirement: Comparison building cannot block publication
Comparison-group building SHALL run as part of a scheduled sync, after sources are merged, and its failure SHALL NOT prevent the snapshot from being published.

#### Scenario: Classification or comparison fails
- **WHEN** comparison building fails during a scheduled sync (e.g. the classification service is unavailable) while at least one source succeeded
- **THEN** the snapshot SHALL still be published with the previously published comparison groups (or none, if there are none), and the failure SHALL be logged

#### Scenario: Successful sync
- **WHEN** a scheduled sync completes with comparison building succeeding
- **THEN** the published snapshot SHALL contain comparison groups derived from that run's offers

#### Scenario: No comparison work on a user page request
- **WHEN** a user requests any page
- **THEN** the system SHALL read comparison groups from the published snapshot and SHALL NOT run classification or comparison building
