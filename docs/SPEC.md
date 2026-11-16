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
- **Mistakes teach.** A missed piece shows where it belonged before the next one drops.
- **Reward speed and streaks, not grinding.** Points scale with how early the answer comes; first-try
  streaks multiply. No accounts, no ads, no server; records stay on the device and results share as text.
- **Maps are packs.** One JSON file per map, generated from open boundary data.

## Out of scope for now

Capitals and other facts beyond names, sound, accounts or online leaderboards, zooming, installable PWA,
languages other than Spanish.

## Build order (each step leaves something playable)

1. **Done:** Costa Rica provinces, levels, scoring, lives, records, share, self-test.
2. San José cantones: subset filter in the generator, and small-region handling (zoom or magnified tap).
3. Central America: one provinces/departments pack per country, a country picker on the home screen.
4. Seeded daily challenge (the engine already takes a seeded generator) so everyone gets the same order.
5. Hosting (Netlify or similar), then sound and polish from playtests.

## Assumptions register

| Assumption | Status | Cheapest test | If false |
|---|---|---|---|
| geoBoundaries has usable ADM1 for Costa Rica | **Holds** (2026-11-16): 7 provinces, simplified file 160 KB, ODbL via OpenStreetMap | fetch the API entry, count features | use another source such as Natural Earth |
| A label point inside each region can be computed without a GIS library | **Holds**: self-test checks it per pack | `./selftest.sh` | add a dependency to the generator |
| The straight north-south edge in south-east Limón is real, not a simplification artefact | **Holds**: present in the full-resolution file too; it is the border with Panama | compare simplified and full files | rebuild from the full-resolution file |
| geoBoundaries ADM2 matches today's cantones of San José | **Untested**; its Costa Rica data represents 2017 and cantones have been created since | fetch CRI ADM2, compare the list with an official one | find a newer source (IGN/SNIT) |
| geoBoundaries ADM1 exists with an open licence for the other six countries | **Untested** | fetch each API entry | per-country sources |
| Tapping works with around 20 small regions on a phone | **Untested**, expected false without zoom | build the cantones pack and try it | step 2 covers it |
