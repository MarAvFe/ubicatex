# Spec

## Problem

A quick, replayable way to learn where places are, in Spanish, on a phone. Inspired by 1990s
falling-piece geography games; not a copy of any of them.

Success for the first slice: the Costa Rica provinces map is playable end to end on phone and desktop, and
adding the next map is a data task.

## The opinion

- **Tap, don't drag.** The piece falls on its own; the player taps the place. Dragging a falling object is
  fiddly on a touch screen.
- **Short rounds.** A game lasts a few minutes at most; the fall time is the timer, shown as a bar.
- **Mistakes teach, they don't solve.** In levels 1 and 2 a missed piece shows where it belonged. From
  level 3 the place stays empty and the piece comes back after the others.
- **Clues scale.** Name and shape, name, shape, capital, then all mixed and faster. The countries map uses
  the same ladder, so capitals of countries come for free.
- **Reward speed and streaks, not grinding.** Points scale with how early the answer comes; first-try
  streaks multiply.
- **One game a day that everyone shares.** The daily challenge is seeded by map and date: ten pieces, once,
  with a result made to paste into a chat.
- **Arcade, not account.** Top ten per map with three-letter names, on the device. No server.
- **Maps are packs.** One JSON file per map, generated from open boundary data and Wikidata names.
- **No zoom.** Small regions are handled by forgiving near taps, and each map gets a generated assessment
  (`docs/MAPS.md`) of whether that is enough.

## Out of scope for now

Hosting, accounts or online leaderboards, zooming, maps of single regions of the world (Europe, Asia…), installable PWA, languages other than Spanish, recorded
audio.

## Build order (each step leaves something playable)

1. **Done:** Costa Rica provinces, levels, scoring, lives, records, share, self-test.
2. **Done:** the other six countries and the countries map, map picker, capitals, missed pieces that
   return, daily challenge, arcade top scores, sound, tap assessment.
3. **Done:** North and South America, world continents, oceans, seas; neighbouring land drawn as
   context on every map.
4. Check names and capitals against official sources (needed before hosting).
5. San José cantones: subset filter in the generator; decide what to do about regions too small to see.
6. Hosting, when asked. A shared top-score table would need a server and is a separate decision.

## Assumptions register

| Assumption | Status | Cheapest test | If false |
|---|---|---|---|
| geoBoundaries has usable ADM1 for Costa Rica | **Holds** (2026-11-16): 7 provinces, simplified file 160 KB, ODbL via OpenStreetMap | fetch the API entry, count features | use another source such as Natural Earth |
| A label point inside each region can be computed without a GIS library | **Holds**: self-test checks it per pack | `./selftest.sh` | add a dependency to the generator |
| The straight north-south edge in south-east Limón is real, not a simplification artefact | **Holds**: present in the full-resolution file too; it is the border with Panama | compare simplified and full files | rebuild from the full-resolution file |
| geoBoundaries ADM2 matches today's cantones of San José | **Untested**; its Costa Rica data represents 2017 and cantones have been created since | fetch CRI ADM2, compare the list with an official one | find a newer source (IGN/SNIT) |
| geoBoundaries ADM1 exists with an open licence for the other six countries | **Holds** (2026-11-16): all six fetched; licences are ODbL, CC BY-SA 2.0 (El Salvador) and CC BY 2.5 (Belize) | fetch each API entry | per-country sources |
| Wikidata has a Spanish name and a capital for every unit, keyed by ISO 3166-2 | **Holds** for presence (all 97 units and 7 countries matched). **Correctness is unchecked**: nobody has compared the capitals with official lists | the build fails on any unmatched unit | hand-kept CSV |
| Natural Earth's continent polygons can serve as the continents | **False** (2026-11-16): they leave out Central America, the Caribbean, Madagascar, New Zealand and more. Continents are built from countries instead | point-in-polygon on known places | — |
| Natural Earth's oceans include their seas | **False**: oceans and seas do not overlap, so marginal seas are merged into their ocean by a list in `tools/packs.json` | point in the Caribbean against the Atlantic polygon | — |
| Country capitals from Wikidata are right | **Holds** for every country in the game against a second source (Natural Earth populated places) on 2026-11-16, except Greenland and French Guiana, which that source lacks. Province capitals are still unchecked | compare the two lists | — |
| The boundary data is current | **Known gap**: Panama's file represents 2017 and lacks the Naso Tjër Di comarca (created 2020), which shows as part of Bocas del Toro | compare unit lists with Wikidata's | newer source for Panama |
| Country outlines from different surveys fit together | **Holds** well enough: seams are hidden by the border stroke at screen size (checked on screenshots) | look at the countries map | build the countries map by merging ADM1 units |
| Tapping works with around 20 small regions on a phone | **Holds by calculation** with the 14 px tap forgiveness (`docs/MAPS.md`: every map `ok` or `tight`). **Not tried on a real phone.** Seeing the small regions is a separate, open problem | play Guatemala and Honduras on a phone | zoom, or an inset for crowded areas |
