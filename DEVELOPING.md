# Developing zip-zap-map-cr

Static site, no build step, no dependencies.

| Path | What |
|---|---|
| `index.html`, `css/style.css` | markup and styles; all player-facing text is Spanish |
| `js/engine.js` | the rules: levels, scoring, lives. No DOM, no clock; time is fed in with `tick(ms)` |
| `js/app.js` | screens, map drawing, input, frame loop |
| `js/selftest.js` | tests, including bots that play whole games |
| `packs/*.json` | generated map packs; `packs/index.json` lists them for the home screen |
| `tools/build_pack.py`, `tools/packs.json` | generates the packs from `data/sources/*.geojson` |

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

1. Save boundary GeoJSON under `data/sources/`. geoBoundaries has every country:
   `https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/ADM1/` returns a `simplifiedGeometryGeoJSON` link
   (ADM1 = provinces or departments, ADM2 = cantones or municipalities). Note the licence it reports.
2. Add an entry to `tools/packs.json`: id, title, subtitle, flag, source, the property holding the name and
   the id, a prefix to strip from names, a `clip_bbox` (west, south, east, north) that leaves out far
   islands, and the attribution line in Spanish.
3. `python3 tools/build_pack.py` then `./selftest.sh`.
4. Read the region names against an official source before publishing; the generator copies whatever the
   data says.

Not built yet, and needed for the planned maps:

- **A subset of a file** (San José's cantones out of all ADM2 units): geoBoundaries ADM2 has no parent
  field, so the generator needs a "keep units whose label point is inside region X of pack Y" filter.
- **Many small regions**: with around 20 or more, some are too small to tap on a phone. That needs zoom or
  a magnified tap target; see `docs/SPEC.md`.

## Release

Batch changes under `[Unreleased]` in `CHANGELOG.md`; cut a version with the `release` skill.
