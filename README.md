# Mapazo (zip-zap-map-cr)

**A geography game in Spanish for the browser: continents, oceans, seas, countries and provinces fall from the
top of the screen and you tap where each one belongs on the map before it lands.**

<img src="docs/screenshots/home.png" alt="Home screen with the map picker" height="400"> <img src="docs/screenshots/mobile.png" alt="A province falling above the map of Costa Rica" height="400"> <img src="docs/screenshots/scores.png" alt="Arcade-style top scores" height="400">

<img src="docs/screenshots/desktop.png" alt="The continents map on a desktop screen" width="640">

## Run

```
./run.sh
```

Then open <http://localhost:8000/>. It is a static site with no build step, so any static host works too.

| Do | Key | Action |
|----|-----|--------|
| Tap or click a province | | Places the falling piece there |
| Tap ❚❚ | `Esc` or `P` | Pause (the map is hidden while paused) |

## How it plays

- **Free play.** Each level is one pass through every region: name and shape, then name only, shape only,
  capital only (★), then everything mixed and faster.
- A faster answer scores more. Three first-try answers in a row raise the multiplier, up to ×5.
- Three lives. A piece that reaches the ground costs one; a level with no mistakes gives one back.
- In levels 1 and 2 a missed piece shows where it belonged. From level 3 the place stays empty and the
  piece falls again later.
- **Daily challenge.** Up to ten pieces (each region once on smaller maps), the same for everyone on the same
  day and map, played once. The result shares as a row of coloured squares.
- **Top scores.** The best ten per map, with three-letter names, as on an arcade machine. They are kept on
  the device; there are no accounts and no server.
- Sound effects and a quiet menu tune, both synthesised; one button turns them off.

## Maps

- The world: continents (America counted as one), oceans, and the main seas and gulfs.
- North, Central and South America by country.
- The provinces or departments of Costa Rica, Guatemala, Belize, El Salvador, Honduras, Nicaragua and Panama.

World maps are best played with the phone sideways. Maps are data files; adding one needs no game code, see
[DEVELOPING.md](DEVELOPING.md). [docs/MAPS.md](docs/MAPS.md) says how tappable each one is on a phone.

Boundaries: [Natural Earth](https://www.naturalearthdata.com/) (public domain) and
[geoBoundaries](https://www.geoboundaries.org/) (© OpenStreetMap contributors, ODbL and CC BY-SA 2.0; Wikimedia
Commons, CC BY 2.5). Names and capitals: [Wikidata](https://www.wikidata.org/) (CC0).

## Self-test

`./selftest.sh` plays whole games with bots in a headless browser and prints `SELFTEST PASS` or what failed.
It runs on in-memory storage, never on saved records.

## Licence

Code: MIT, see [LICENSE](LICENSE). Map data in `data/` and `packs/`: the licences listed under Maps.
How it was made: [PROMPT.md](PROMPT.md).
