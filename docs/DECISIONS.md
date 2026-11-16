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

## Second round (2026-11-16)
- **The falling piece is a bare silhouette and name: accent fill, dark outline, white halo, drop shadow.** — Asked for no box; it has to read over sea, land and every placed colour. — `.piece` rules in `css/style.css`.
- **From level 3 a missed piece is not revealed; it goes to the back of the queue. It still costs a life.** — "Mistakes teach but not solve, at least not after level 2." — `revealThroughLevel` in `RULES`, and the `miss` branch of `tick` in `js/engine.js`.
- **Capital is its own level (4th) and joins the mix afterwards, marked with ★.** — Keeps the name → shape ladder and adds one more rung. — `levelRules` and `mixClues` in `js/engine.js`.
- **"Centroamérica · Países" is an ordinary pack with seven regions**, so capitals of countries use the same ladder. — No special mode to maintain. — Remove or edit its entry in `tools/packs.json`.
- **Panama and Nicaragua packs include comarcas and autonomous regions.** — They are first-level units; leaving them out would put holes in the map. — Would need a "background, not playable" region type in the pack format.
- **Names and capitals come from Wikidata, cleaned of "Departamento de" and similar.** — One source, in Spanish, for all seven countries, and the boundary files' own labels mix English and Spanish. — Replace the CSVs in `data/sources/`; cleaning rules are `clean_name` and `clean_capital` in `tools/build_pack.py`.
- **Daily challenge: 10 pieces, 6 s each, clues mixed, no lives, always reveals, first attempt of the day is the one kept.** — A fixed length makes results comparable and gives a shareable row of squares. — `dailyPieces`, `dailyFallMs` in `RULES`; the keep-first rule is in `finish` in `js/app.js`.
- **The day changes at the player's local midnight.** — Simplest, and right for players in one time zone. — `localDate` in `js/engine.js`; use a fixed UTC offset if players abroad should share the same day.
- **Top scores: best 10 per map, free play only, three characters A–Z/0–9, stored on the device.** — "Public name" has nowhere to be public without a server, and hosting is off for now. — `topScores` in `RULES`; a shared table needs a backend and replaces `table()` and `submitInitials` in `js/app.js`.
- **A tap within 14 px of the right region counts as right, even if it lands on a neighbour.** — No zoom, and several regions are narrower than a fingertip. It only ever helps the player. — `TAP_SLOP_PX` in `js/app.js` and `TAP_SLOP` in `tools/build_pack.py` (keep equal); set both to 0 to turn it off.
- **Sound is synthesised in the browser; the tune plays on menus, not during play.** — No audio files to make or license, and nothing competing with the effects mid-game. — `js/sound.js`; the notes are `TUNE`.
- **Share text omits the link when the game runs from localhost.** — The game is local-only for now and such a link is useless to the receiver. — `share` in `js/app.js`.
- **Smaller name labels on maps with more regions (26, 20 or 16 map units).** — Fewer overlaps on crowded maps. — `labelSize` in `tools/build_pack.py`.
