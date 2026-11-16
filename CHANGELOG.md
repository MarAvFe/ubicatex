# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x while the project is young).

## [Unreleased]

### Added
- Hosted at https://marcelloavila.com/ubicatex/ (GitHub Pages).
- "Mapa" view: every map coloured and named for study; tap a region for its name and capital.
- End-of-level review: the right answers colour in and the game waits for "Siguiente".
- `tools/lan-open.ps1` / `tools/lan-close.ps1` to play from a phone on the home network.
- The game: pieces fall and the player taps their place on the map; levels, speed and streak scoring,
  three lives, per-map records, pause, share as text.
- Map pack *Costa Rica · Provincias* and the generator that builds packs from boundary GeoJSON.
- Self-test with bots that play whole games and a check of every pack's geometry.
- Maps for Guatemala, Belize, El Salvador, Honduras, Nicaragua, Panama and Central America by country,
  with a map picker at the top of the home screen.
- Capitals: a capital-only level after the shape level, and capitals in the mixed levels.
- Daily challenge: ten seeded pieces per map and day, played once, shared as coloured squares.
- Arcade-style top ten per map with three-letter names.
- Sound effects and a menu tune, with a mute button.
- `docs/MAPS.md`: a generated assessment of how tappable each map is on a phone.

- Maps of the world by continent (America as one), oceans, and seas and gulfs; North and South America by
  country.
- Neighbouring land drawn as grey context on every map.
- A hint to turn the phone sideways on world maps.

### Changed
- The game is now called Ubicatex.
- Home menu is a map dropdown and Jugar, Mapa, Mejores puntajes; rules and sources are folded away. The
  daily challenge is hidden.
- A level's title shows before its first piece falls.
- Falling pieces shrink to fit narrow screens and stay inside them.
- Capitals are only played on the country maps.
- Numbers are written 1,130 instead of 1 130.
- The falling piece is a bare outlined silhouette and name, without a box.
- From level 3 a missed piece is no longer revealed; it falls again later.
- A tap within 14 px of the right region counts as right, measured exactly.
- Map names keep the same size on screen on every map.

### Fixed
- Falling pieces all started at the left edge of the screen.
- Each tap paused the menu music for a moment.
- The game froze when the streak multiplier reached ×5 (on Continentes: no "Siguiente" after level 2).
- The pause screen showed the rotate hint over its buttons.
- On small phones with the rules open, the top of the home screen could not be reached.
- The daily challenge no longer repeats regions on maps with fewer than ten: three extra pieces used to fall
  onto places already filled in.
