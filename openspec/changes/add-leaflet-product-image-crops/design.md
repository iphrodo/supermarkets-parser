## Context

Product images exist for one of three retailers. Kaufland's scraper reads `raw.listImage` off the embedded SSR JSON and stores it as `imageUrl`; the EAN is even regexed back out of that same URL. Lidl's XLSX price list has no image column at all. Billa and the Lidl leaflet have no product-level image anywhere in their sources — only full-page leaflet JPGs, which `vision-extraction.ts` already downloads into memory, base64s into a Gemini call, and discards.

So the raw material for Lidl and Billa images is already being fetched on every new-leaflet run. What is missing is the *location* of each product within its page.

Measurements taken against the live endpoints (2026-08-06):

| | Billa (Publitas) | Lidl (Schwarz leaflets) |
|---|---|---|
| Sizes offered | 8: `at200`…`at2400` | 3: `thumbnail`, `image`, `zoom` |
| Currently used for vision | `at1600` (1352×1893) | `zoom` (2400-fit, 501 KB) |
| Best client candidate | `at800` (676×947, 199 KB) — `at600` = 127 KB also viable | `image` (699×1200, 188 KB) |
| Smaller variants | freely constructible | **HMAC-signed**; forging `insecure/`, `_/`, or reusing another size's signature all return 403 |
| Page dimensions in manifest | absent — must be parsed from the `fit-in/676x947` URL segment | present as `width`/`height` (original 1398×2400) |
| Foreign `Referer` | 200 | 200 |
| `Access-Control-Allow-Origin` | absent | absent |
| Cache headers | `immutable, max-age=31536000` | `immutable, max-age=31536000` |

Billa's leaflet runs to 50 pages (26 spreads). Kaufland's CDN ignores `?wid=` and returns 403 for `&fmt=webp`, so its ~180 KB images cannot be shrunk either.

## Goals / Non-Goals

**Goals**
- A product image for leaflet-sourced offers, at no additional model, storage, or bandwidth cost beyond what the pipeline already pays.
- Wrong images are worse than missing images: every ambiguity resolves toward "no image".
- One rendering interface for all three image situations, so consumers never branch on retailer.

**Non-Goals**
- Server-side cropping, an image proxy, or `@nuxt/image`. Noted as the escape hatch if bandwidth proves unacceptable, but not built now.
- Backfilling images for the Lidl XLSX source — its data genuinely contains no images and no page to crop from.
- Segmentation masks. Gemini can return them, but a rectangular crop of a leaflet tile is adequate and a base64 PNG mask per product would bloat both the response and the snapshot.

## Decisions

### Bounding boxes come from the existing vision call, not a new one

The alternative — a second detection pass, or a local vision model — was rejected on both cost and deployability. The extraction call already sends the page image and already returns structured JSON; adding `box_2d` and `boxConfident` costs roughly 12–18 output tokens per item (≈11k extra output tokens for a full 50-page Billa leaflet). A local model is a non-starter regardless of quality: `runDailySync` executes server-side under Nitro on the deployment host, where no locally-installed model exists.

The wire field is named `box_2d` in snake_case, deliberately against the surrounding camelCase convention, because that is the identifier Gemini models are trained on for detection, with `[ymin, xmin, ymax, xmax]` normalized to 0–1000. Renaming it costs accuracy for cosmetics.

`propertyOrdering` puts `box_2d` first in each item so the model localizes before it describes; describe-then-localize measurably degrades box quality with constrained decoding.

### Cropping happens in CSS on the client, not on the server

Three options were considered:

1. **Server-side crop with `sharp`, upload to blob storage.** Adds a native dependency, a storage bill, and a lifecycle problem (old crops must be garbage-collected weekly). Rejected — the requirement was explicitly "for free".
2. **Client-side canvas crop.** Impossible: neither CDN sends `Access-Control-Allow-Origin`, so `drawImage` from those origins taints the canvas and `toDataURL`/`getImageData` throw. This is not a preference; it is a hard block.
3. **CSS crop.** An oversized `<img>` inside an `overflow: hidden` container, positioned by percentage. No CORS grant needed, no processing, no storage.

CSS it is. The `<img>`-inside-container form is chosen over `background-image` specifically so that native `loading="lazy"` still applies — with `background-image` the browser has no element to defer.

Two geometry details are load-bearing:

- The container carries a **fixed** inline `aspect-ratio` (square), identical for all three modes, so space is reserved before the image loads and lazy loading causes no layout shift. The crop is then fitted inside it the way `object-fit: contain` would — scaled to whichever axis binds first and centred, keeping its true proportions. Taking the aspect ratio *from the crop* was tried first and rejected in verification: a portrait box (a salami stick, a beer can) rendered roughly three times taller than a landscape box beside it and stretched the whole grid row with it. Card height must not be a function of how the model happened to shape a box.
- The `<img>` needs `max-w-none`. Tailwind's preflight sets `img { max-width: 100% }`, which silently clamps the >100% width the crop depends on. Every crop renders wrong without it, and the failure looks like a bad bounding box rather than a CSS problem.

### Leaflet pages are a snapshot-level registry, not a field on every offer

Denormalizing the page URL, width, and height onto each of ~1000 leaflet offers would add roughly 200 KB to a KV value that already holds ~5000 offers and is written as a single `SET`. A `Record<pageId, LeafletPage>` costs ~30 bytes per offer instead.

`pageId` is derived and stable — `` `billa:${slug}:${pageNumber}` `` — not an array index. That makes merging two sources' maps a plain `Object.assign` with no remapping, and lets the partial-failure carry-forward path select a source's pages by key prefix.

The registry must be pruned to pages actually referenced by surviving offers before publication, or dead pages accumulate one leaflet per week forever.

### Validation is aggressive, and its failure mode is "no image"

`sanitizeBox` rejects a box unless it is exactly four finite integers in `[0, 1000]` with `ymin < ymax` and `xmin < xmax` after clamping, each side at least 2.5% of the page, area at most 25% of the page, and aspect ratio between 1:4 and 4:1. Surviving boxes are padded 4% per side so tight boxes do not shave the product.

Inverted axes are **rejected, not swapped**. An inverted box usually means the model emitted `[xmin, ymin, xmax, ymax]`; swapping it produces a confidently wrong crop, which is exactly the outcome this design is trying to avoid.

`rejectOverlappingBoxes` then runs per page: pairwise IoU over ~15–20 items is free, and any pair above 0.5 loses its box on **both** sides. Dense leaflet pages are the hard case for detection, and duplicate or shifted boxes are the characteristic failure there.

Rejections are reported as one aggregate log line per run via the existing `logWarning` dependency, **not** pushed into `offer.warnings`. The comparison details view (a later change) renders `warnings`, and hundreds of "box rejected" lines would bury the genuine price-outlier warnings that field exists for.

## Risks / Trade-offs

- **Box accuracy on dense pages is the real unknown.** Constrained decoding via `responseSchema` is known to degrade detection quality relative to free-form output, and a page with 20 tightly-packed tiles is the worst case. Mitigations are stacked (`propertyOrdering`, the "one box per offer; if two offers share a photo, give it to neither" prompt rule, geometric checks, IoU filtering), and the fallback chain means poor coverage degrades to placeholder tiles rather than to a broken page. If first-run coverage lands below ~50%, the response is to tune the prompt or raise the extraction-side resolution — neither of which affects client cost.
- **Bandwidth.** Worst case is 24 cards each drawing a distinct page image: ~4.5 MB. In practice `loading="lazy"` limits the first paint to roughly 6–9 images (~1.3 MB), and a leaflet page is shared by 10–20 offers with a year-long immutable cache. If this proves unacceptable, the escape hatch is `@nuxt/image` with the Vercel/IPX provider pre-cropping to ~200px WebP. For calibration: `/deals` already ships uncontrolled ~180 KB Kaufland JPEGs today.
- **Lidl's client image size is fixed at 188 KB.** Three attempts to forge a smaller signed variant returned 403, and `thumbnail` at 233×400 yields a ~58px tile — too soft for a card hero. Billa can reach 127 KB at `at600`, so the two retailers will have different quality/cost profiles. Accepted.
- **Snapshot size.** The registry keeps growth to ~30 KB, but the snapshot is a single KV `SET` — the plan's per-request size limit should be checked before shipping.
- **Change detection hides the new prompt.** `readLastBillaPublicationSlug` / `readLastLidlLeafletSlug` short-circuit before pages are fetched, so a deploy alone produces zero crops until the leaflet slug rolls over. The two KV keys must be deleted as a deploy step.
- **Fixture drift.** `test/fixtures/lidl-flyer-weekly.json` models a page as `{number, zoom}`; the live API returns 12 fields. Tests written against the current fixture would validate a payload shape that does not exist.

## Open Questions

- Should Billa use `at600` (127 KB) rather than `at800` (199 KB) for client crops? `at800` is the conservative starting point; the QA page will show whether `at600` crops are legible at card size.
- Is a page-level fallback worth it — linking an offer with no usable box to its leaflet page image — or does that just show the user a wall of leaflet they have to search? Deferred; the placeholder tile is the answer for now.
