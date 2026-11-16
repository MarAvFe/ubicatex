# Decisions

Format: reading taken — reason — how to change.

## Setup (2026-11-16)
- **Template:** `single-file-web-tool` from the `new-project` skill, split into `index.html` + `css/` + `js/` + `packs/`. — Maps are separate data files, which rules out one file; the rest of the template (no build step, `#selftest`, `selftest.sh`) fits. — Nothing to undo; a bundler can be added later without changing the modules.
- **Audience:** general public, phone first; not the young-child game rules. — The request keeps scoring, levels and timers, which need reading and a fail state. — For a small child, build a separate mode with no timer and no lives; see the `kid-game` skill.
- **Player-facing name "Mapazo"**, folder stays `zip-zap-map-cr`. — The original title is a registered trademark and this is a new game using a generic mechanic. — Change the `<title>`, the `.logo` heading in `index.html` and the first word of `shareText` in `js/engine.js`.
- **Tap the place instead of dragging the piece.** — Works with one thumb; dragging a moving piece on a phone is error-prone. — Input is one `pointerdown` handler in `js/app.js`; a drag mode would call the same `tap(id)`.
- **Spanish in the usted form.** — Usual for Costa Rican public-facing text and there is no voice doc yet. — All strings are in `index.html` and the top of `js/app.js`.
- **Clues are name and shape only; no capitals.** — Names come straight from the data; capitals would be new facts to verify. — Add a field to the pack and a clue type in `levelRules`.

## Rules (2026-11-16)
- **A level is one pass through all regions; fall time 9 s, then 7.5 s, then down to a 2.5 s floor.** — Short rounds; the floor keeps it possible on a phone. — `levelRules` in `js/engine.js`.
- **100 points + up to 100 for speed, multiplier +1 per 3 first-try answers up to ×5, 200 × level for clearing a level.** — Rewards knowing the map quickly over playing long. — `RULES` in `js/engine.js`.
- **Three lives; only a landed piece costs one. A wrong tap breaks the streak and halves that piece.** — Guessing should cost something without ending the game. — `answer` and `tick` in `js/engine.js`.
- **A level with no mistakes returns one life.** — Gives a way back after an early slip. — `afterPiece` in `js/engine.js`.
- **Pause hides the map.** — Otherwise pausing is a way to study the answer. — `.overlay` background in `css/style.css`.

## Map data (2026-11-16)
- **Source: geoBoundaries gbOpen, simplified GeoJSON (from OpenStreetMap, ODbL).** — Covers every country at ADM1 and ADM2 with one API, small files. — Swap `source` in `tools/packs.json`; the generator only needs GeoJSON polygons with a name property.
- **Isla del Coco is left off the map.** — It lies about 500 km offshore and would shrink the mainland to a third of the screen. — Widen `clip_bbox` in `tools/packs.json`, or add an inset to the generator.
- **Islets under 1% of their region's main area are dropped.** — Untappable and unrecognisable at phone size. — `MIN_PART_SHARE` in `tools/build_pack.py`.
- **Simple equirectangular projection with mid-latitude correction.** — No library needed and no visible distortion at country scale this near the equator. — `build()` in `tools/build_pack.py`.
- **Source GeoJSON is committed under `data/sources/`.** — Packs can be rebuilt offline and the exact input is on record (commit 9469f09 of geoBoundaries). — Delete and re-download from `source_url`.
