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

## Third round (2026-11-16)
- **Bug fixed: the daily challenge padded maps with fewer than ten regions up to ten by repeating regions**, so on Centroamérica three pieces fell onto places already filled in. This was a rule I chose, not a slip, and it was the wrong one. Now a daily plays each region once, up to ten. — A repeat on a filled-in map reads as a bug. — `total` in `createGame`, `js/engine.js`.
- **Six continents with America as one: América, Europa, Asia, África, Oceanía, Antártida.** — As asked; it is the model taught in Latin America. — The `map` of the continents source in `tools/packs.json`.
- **Continents are built by merging Natural Earth countries by their continent field; Russia is cut at 60° E, France's French Guiana goes to America.** — Natural Earth's own continent shapes leave out whole regions, and its country file puts all of Russia in Europe. 60° E is a straight-line stand-in for the Urals. — The `split` list in `tools/packs.json`.
- **Norteamérica is Canada, the United States, Mexico and Greenland; Central America and the Caribbean are separate.** — The Latin American convention, and Centroamérica already has its own map. Greenland is a Danish territory, hence "países y territorios". — The `filter` of that pack in `tools/packs.json`.
- **Sudamérica is the twelve countries plus French Guiana. The Falklands/Malvinas are drawn as background land, not a piece.** — French Guiana fills a visible gap; naming the islands either way takes a side in a sovereignty dispute. — Add `FLK` to the pack's filter to make them a piece.
- **Hawaii, the Galápagos and the US Aleutians beyond the frame are not pieces.** — Same reason as Isla del Coco: they would shrink the mainland. Hawaii still shows as background where the frame reaches it. — `drop_bboxes` in `tools/packs.json`.
- **Oceans: five (Pacífico, Atlántico, Índico, Ártico, Antártico). Marginal seas whose ocean is not in dispute are merged into it** (Caribbean, Gulf of Mexico, Mediterranean → Atlántico; Coral, South China, Japan… → Pacífico; Arabian, Red, Bengal, Persian Gulf → Índico). **Black and Caspian seas, Hudson and Baffin bays stay neutral water** that is not a target. — Natural Earth draws seas apart from oceans, and sources disagree on those four. — The `OCEAN` map in `tools/packs.json`.
- **"Océano Austral" from Wikidata is shown as "Austral".** — The word "Océano" is dropped from every ocean name in a map titled Océanos. — `KIND` in `tools/build_pack.py`.
- **Seas: the 22 seas, gulfs and bays of Natural Earth's coarsest scale, Caspian Sea included.** — The scale that a world map on a screen can show; the Caspian is a lake but is named and taught as a sea. — The `filter` of `mundo-mares` in `tools/packs.json`.
- **Projections: Equal Earth for the world, Lambert azimuthal equal-area for continents, the old equirectangular for countries.** — Equal-area keeps Greenland and Africa honest; country maps are unchanged. — `projection` per pack.
- **Neighbouring land is drawn in grey on every map, never tappable.** — Context: Costa Rica between Nicaragua and Panama, South America attached to Panama. — `background` per pack; remove it to go back.
- **Labels keep one size on screen (12 px on phones, 16 px otherwise) whatever the map.** — Fixed map-unit sizes were unreadable on world maps. — `sizeLabels` in `js/app.js`.
- **A tap counts if it is within 14 px of the region's outline, measured exactly** (a widened invisible stroke), replacing 16 sample points. — The samples stepped over thin islands. — `regionAt` in `js/app.js`.
- **Borders are simplified by snapping to a grid.** — Unlike dropping points, it treats a shared border the same from both sides, so continents and oceans stay seamless. Small packs grew by about 10%. — `thin` in `tools/build_pack.py`.
- **World maps in a portrait phone show "Gire el teléfono…".** — They are a strip at that shape; no zoom by your rule. — `.stage.wide::after` in `css/style.css`.

## Fourth round (2026-11-16)
- **Name: "Ubícate"** ("find your place", and colloquially "get your bearings"). Alternatives considered: "Atínale", "¿Dónde cae?". — "Mapazo" was rejected. — `GAME_NAME` in `js/engine.js`, plus `<title>` and `.logo` in `index.html`. The storage key stays `mapazo:v1` so saved scores survive.
- **The map does not fill up during a level.** A right answer flashes green and fades; a wrong one flashes red. At the end of the level only the right answers are coloured and named, and the game waits for "Siguiente" (or "Ver resultado" when the game ends). — Asked for: harder (no elimination by looking) and with a learning pause. — `showReview` and `flash` in `js/app.js`; the `review` phase and `next()` in `js/engine.js`.
- **Regions do not repeat within a level.** — With the map staying white, a repeat no longer makes the game harder, only longer; you mentioned keeping repeats as a "maybe". — To add them, append extra ids to `s.queue` in `startLevel` in `js/engine.js`.
- **Missed pieces left white in the review, without their names.** — "Only the correct options color themselves." The "Mapa" view is where the answers are. — `showReview` in `js/app.js`.
- **The daily challenge is hidden, not deleted:** no button, but the engine still supports it (`daily` option, seeded order) and its tests remain. — "Drop it or hide it"; the seeding is the part you liked. — Restore the button from commit `67871a2` (`play-daily` in `index.html`, `dailyDone`/`showDailyResult` in `js/app.js`).
- **Home menu: Jugar, Mapa, Mejores puntajes.** "Mapa" shows the whole map coloured and named; a tap shows the region's name (and capital on country maps) in a bar at the bottom. — Asked for. — `showLearn` and `learnTap` in `js/app.js`.
- **Capitals only on the country maps** (Centroamérica, Norteamérica, Sudamérica). — Their capitals were checked against a second source; province capitals were not. — `"capitals": true` per pack in `tools/packs.json`.
- **Numbers as 1,130.** — es-CR formatting puts a space inside the number. — `num` in `js/engine.js`.
- **Phone access through a Windows port proxy and a firewall rule limited to the local subnet**, set up by `tools/lan-open.ps1` (admin) and removed by `tools/lan-close.ps1`. Nothing is forwarded on the router. — WSL runs behind its own network address, the network is marked Public, and "keep it local" rules out exposing it to the internet. — Run `lan-close.ps1`.
