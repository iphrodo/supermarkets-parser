## REMOVED Requirements

### Requirement: Locate the current week's leaflet
**Reason**: The site's product listing states each product's own promotional window, so there is no leaflet to locate and no weekly identifier to track. This requirement also proved to be the source's actual failure mode in production: the listing page began showing two candidates with a seven-day window, and the mandated "exactly one candidate" rule turned that into a hard failure of the whole source.
**Migration**: Covered by `lidl-site-offer-ingestion` → "Read offers from the public product search API" and "Validity window from structured timestamps".

### Requirement: Fetch leaflet page images
**Reason**: No page images are fetched. Product photographs arrive as individual images referenced by the listing, roughly 9 KB each, versus a 188 KB leaflet page whose signed variants could not be reduced.
**Migration**: Covered by `lidl-site-offer-ingestion` → "Direct product image URL". The extraction/display variant distinction remains in force for Billa, which still ingests leaflet pages.

### Requirement: Extract offers via vision with confidence gating
**Reason**: Names, prices, units, categories, and product photographs are published as structured fields, so no vision model is invoked for Lidl and no confidence gating, bounding-box validation, or overlap rejection applies to this retailer.
**Migration**: Covered by `lidl-site-offer-ingestion` → "Publish only offers that are live and comparable" and "Discount percentage from structured value or discount label", which gate on the presence of structured data rather than on model confidence. `server/utils/scrapers/bounding-box.ts` and the vision extraction utility remain in the codebase for Billa.

### Requirement: Validity dates from leaflet metadata
**Reason**: Validity is published per product rather than per leaflet, so all offers in a run no longer share one window and the leaflet's metadata is no longer the source of dates.
**Migration**: Covered by `lidl-site-offer-ingestion` → "Validity window from structured timestamps".

### Requirement: Provenance metadata
**Reason**: Restated for the new source, with a materially better `sourceUrl`: the product's own page rather than the leaflet page it was extracted from.
**Migration**: Covered by `lidl-site-offer-ingestion` → "Provenance metadata and shared retailer identity".

### Requirement: National scope by default
**Reason**: Restated for the new source, unconditionally rather than "by default" — the listing publishes no per-store or per-region qualifier that could override it.
**Migration**: Covered by `lidl-site-offer-ingestion` → "National scope".

### Requirement: Skip re-ingestion when leaflet is unchanged
**Reason**: The optimisation existed to avoid re-running an expensive vision extraction over unchanged page images. A full ingestion run is now six HTTP requests and no model calls, so caching by leaflet identifier costs more in complexity and failure modes than it saves. It also carried an operational hazard: the stored identifier had to be deleted by hand after any deploy that changed extraction behaviour, or the source silently returned stale results.
**Migration**: No replacement. Every scheduled run reads the listing afresh, and the `lidl-leaflet:last-slug` key is removed from durable storage.
