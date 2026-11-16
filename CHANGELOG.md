# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x while the project is young).

## [Unreleased]

### Added
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

### Changed
- The falling piece is a bare outlined silhouette and name, without a box.
- From level 3 a missed piece is no longer revealed; it falls again later.
- A tap within 14 px of the right region counts as right.
