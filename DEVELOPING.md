# Developing zip-zap-map-cr

Static site, no build step, no dependencies.

| Path | What |
|---|---|
| `index.html`, `css/style.css` | markup and styles; all player-facing text is Spanish |
| `js/engine.js` | the rules: levels, scoring, lives. No DOM, no clock; time is fed in with `tick(ms)` |
| `js/app.js` | screens, map drawing, input, frame loop |
| `js/sound.js` | sound effects and menu tune, synthesised with Web Audio |
| `js/selftest.js` | tests, including bots that play whole games |
| `packs/*.json` | generated map packs; `packs/index.json` lists them for the home screen |
| `tools/build_pack.py`, `tools/packs.json` | generates the packs and `docs/MAPS.md` from `data/sources/` (about 30 s) |
| `tools/lan-open.ps1`, `tools/lan-close.ps1` | let phones on the home network reach the WSL server (Windows, as admin) |
| `tools/fetch_sources.py` | re-downloads and trims the Natural Earth files in `data/sources/` |

Keep rules in `engine.js` so the self-test can cover them without a browser clock.

## Self-test

```
./selftest.sh
```

Serves the folder, opens `index.html#selftest` in a headless browser and exits 0 on `SELFTEST PASS`.
It finds Chromium or Chrome on PATH, or Playwright's cached headless shell; set `CHROME=` to choose.
Add a test for every behaviour you change. One test checks every pack in `packs/index.json`: each label
point must lie inside its own region and no other, so a bad pack fails without anyone looking at it.

## Adding a map

1. Save boundary GeoJSON under `data/sources/`. For countries, continents, oceans and seas the Natural Earth
   files already there are enough (`tools/fetch_sources.py`). For provinces, geoBoundaries has every country:
   `https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/ADM1/` returns a `simplifiedGeometryGeoJSON` link
   (ADM1 = provinces or departments, ADM2 = cantones or municipalities). Note the licence it reports.
2. Names and capitals come from a CSV (`iso,itemLabel,capLabel`), not from the boundary file, whose labels
   mix languages. `data/sources/wikidata-adm1.csv` covers Central America; it is the result of this
   query at <https://query.wikidata.org/>, with other country prefixes for other regions:

   ```sparql
   SELECT ?iso ?itemLabel ?capLabel WHERE {
     ?item wdt:P300 ?iso . FILTER(REGEX(?iso, "^(CR|GT|BZ|SV|HN|NI|PA)-"))
     OPTIONAL { ?item wdt:P36 ?cap . }
     SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
   } ORDER BY ?iso
   ```

   Regions are matched to rows by ISO 3166-2 code, or by name when the boundary file has no code; the
   build stops if any region finds no row.
   `data/sources/wikidata-adm0.csv` (countries, by ISO alpha-2) and `wikidata-world.csv` (continents,
   oceans and seas, by Wikidata id) come from similar queries.
3. Add an entry to `tools/packs.json`. The fields are documented at the top of `tools/build_pack.py`;
   the existing entries cover the common cases: one file of provinces, several country files, countries
   filtered from a world file, features merged into a region (continents, oceans), neighbouring land as
   background, and a projection (`equirect` for a country, `laea` for a continent, `equalearth` for the world).
4. `python3 tools/build_pack.py`, then `./selftest.sh`, then read the new row in `docs/MAPS.md`.
5. Read the names and capitals against an official source before publishing; the generator copies
   whatever the sources say.

Not built yet, and needed for the planned maps:

- **A subset of a file** (San José's cantones out of all ADM2 units): geoBoundaries ADM2 has no parent
  field, so the generator needs a "keep units whose label point is inside region X of pack Y" filter.
- **Maps with regions too small to see.** Taps are forgiven by 14 px, which makes every current map
  playable, but `docs/MAPS.md` lists regions a phone player can barely see. Cantones will be worse.

## Release

Batch changes under `[Unreleased]` in `CHANGELOG.md`; cut a version with the `release` skill.
