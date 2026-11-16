# How this project was made

An AI coding agent (Claude, in Claude Code) built this project from the prompt below. Section 1 is the
**bootstrap prompt**, unedited, with any clarifying questions and their answers. Section 2 lists the
**follow-up directions** that changed scope or direction. Small fixes are left out.

---

## 1. Bootstrap prompt

> build a Costa Rica version, web based. make it extensible. mvp is costa rica but it will be extensible to san Jose and it's cantones. then extend it to every central american country (only provices yet). make it in spanish. styles will be simple but pretty, keep scoring and levels and timers 2026-relevant

Context: this followed a short research request about a 1994 falling-piece geography game for Windows
("run a quick research on what this software was, what is does and how it works"), which is the "version"
the prompt refers to.

No clarifying questions were asked; the assumptions taken are in `docs/DECISIONS.md`.

## 2. Follow-up directions

- 2026-11-16 —
  > Make the falling stuff have no white box behind, just the silhouette. and the borders should make it stand out properly, same with letters. add the other countries and a map picker at the top. also a top score screen as old-school arcade machines (3-letter public name)
  >
  > from decisions.md: mistakes teach but not solve. at least not after level 2, they remain empty and then fall again after other options.
  >
  > capitals can be another level. I like how name/shape, then name then shape scales. capital could be mixed within as well somehow in a countries level (whole central america together).
  >
  > we can add some basic sound on taps and good/wrong choices, light menu music. no accounts, no zooming; maybe a map can get some asessment if boundaries per size would require zoom because i guess some maps could face a challenge though.
  >
  > i like the seeding concept to make this as wordly though. don't host, keep it local yet.
