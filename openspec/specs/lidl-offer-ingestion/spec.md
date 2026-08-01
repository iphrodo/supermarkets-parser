# lidl-offer-ingestion Specification

## Purpose

Downloads and parses Lidl Bulgaria's official, legally-mandated XLSX price-monitoring export into normalized offer records, without relying on the JS-rendered lidl.bg website or a headless browser.

## Requirements

### Requirement: Download official XLSX export directly
The system SHALL download `https://www.lidl.bg/explore/assets/webPriceData/bg/ExportSecondList.xlsx` via a plain HTTP GET on each scheduled run, and SHALL NOT use a headless browser or execute JavaScript against `lidl.bg`.

#### Scenario: Successful download
- **WHEN** the scheduled job runs
- **THEN** the system SHALL fetch the current XLSX file fresh on that run, not reuse a stale local copy, so the currently active discounts are reflected

#### Scenario: Download or parse failure
- **WHEN** the file cannot be downloaded, or fails to parse as a valid XLSX workbook
- **THEN** the system SHALL log the failure and SHALL NOT publish an empty or partial Lidl offer set in place of the last known-good data

### Requirement: Parse pre-computed discount fields
For each row with a non-empty current discounted price ("Текуща намалена цена"), the system SHALL extract: product name, brand (nullable), net quantity/unit text, category code, product code, reference price in EUR cents, discounted price in EUR cents, discount `validFrom`, discount `validUntil`, and discount percentage — all taken directly from the file's own columns, never recomputed from other fields.

#### Scenario: Row without an active discount
- **WHEN** a row's current discounted price column is empty
- **THEN** the system SHALL exclude that row from the set of currently-discounted offers

#### Scenario: Percentage taken as-is
- **WHEN** the file provides a percentage-change value for a row
- **THEN** the system SHALL use that value directly as `discountPercentage` rather than recalculating it from the reference and discounted prices

### Requirement: National pricing, no per-store duplication
Since verified data shows zero price variance across stores for the same product code, the system SHALL deduplicate rows referring to the same product code and discount period into a single national offer, and SHALL NOT emit one offer per store row.

#### Scenario: Same product across many stores
- **WHEN** a product code appears in multiple store rows with identical reference price and identical discounted price for the same period
- **THEN** the system SHALL produce exactly one offer for that product/period, tagged `scope: 'national'`

#### Scenario: Unexpected store-level price divergence
- **WHEN** a product code's price differs across store rows for the same period, contradicting the current national-pricing baseline
- **THEN** the system SHALL record a warning on the resulting offer rather than silently discarding the discrepancy or picking an arbitrary value

### Requirement: Provenance metadata
Every normalized Lidl offer SHALL include `sourceUrl` (the XLSX file URL) and `scrapedAt` (an ISO timestamp of the parse run).

#### Scenario: Successful parse run
- **WHEN** the file is successfully downloaded and parsed
- **THEN** each resulting offer SHALL carry the source URL and a parse timestamp
