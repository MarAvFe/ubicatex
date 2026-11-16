# zip-zap-map-cr

Project facts the code can't show. Keep it short; no code snippets or build order here (they go stale).

## What it is for

"Mapazo": a Spanish-language browser game for learning where places are. Pieces fall, the player taps their
place on the map. Maps so far: Central America by country and the first-level divisions of its seven
countries. Planned next: San José's cantones. Players are the general public on phones first
(not the young-child audience: it has reading, timers and a fail state). Success: someone opens the link on
a phone, understands it without instructions, and plays a second round.

## Non-negotiables

- **A new map is data, never game code.** The whole point is to extend by adding packs; if a map needs an
  `if` in `js/`, the pack format is what should change.
- **The player-facing name is "Mapazo".** The folder name echoes a 1994 title that inspired the mechanic;
  that name, its art and its wording must not appear in anything a player sees.
- **Credit the map data on screen** (ODbL requires it) and keep each pack's attribution accurate.
- **Names and capitals are published facts.** They come from Wikidata and have not been checked against
  official sources yet; do that before the game is hosted (see the assumptions in `docs/SPEC.md`).
- **No accounts, no server, no zoom.** Scores and the daily result stay on the device.

## Working here

- Self-test: `./selftest.sh`. Run it before every commit; it must print `SELFTEST PASS`.
- Decisions go in `docs/DECISIONS.md` (reading taken — reason — how to change).
- Published text is in Spanish (usted form); everything internal is in English.
