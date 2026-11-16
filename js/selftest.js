// Self-test: open index.html#selftest, or run ./selftest.sh. Runs on in-memory
// storage, never on the player's saved records.
import { createGame, levelRules, multiplier, seededRng, shareText, shuffle, RULES } from "./engine.js";
import { createApp, loadJson } from "./app.js";
import { memoryStore } from "./store.js";

const IDS = ["a", "b", "c", "d", "e", "f", "g"];

function eq(actual, expected, what = "") {
  if (actual !== expected) throw new Error(`${what} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond, what) { if (!cond) throw new Error(what); }

// Bots drive the engine in 50 ms steps, as a browser frame loop would.
function play(game, decide, maxSteps = 200000) {
  const log = [];
  for (let i = 0; i < maxSteps && game.state.phase !== "over"; i++) {
    log.push(...game.tick(50));
    const piece = game.state.current;
    if (piece) {
      const id = decide(piece, game.state);
      if (id) log.push(...game.answer(id));
    }
  }
  return log;
}

const tests = {
  "levels get harder and never faster than the floor"() {
    eq(levelRules(1).clue, "both");
    eq(levelRules(2).clue, "name");
    eq(levelRules(3).clue, "shape");
    for (let n = 2; n < 40; n++) ok(levelRules(n).fallMs <= levelRules(n - 1).fallMs, `level ${n} is slower than ${n - 1}`);
    eq(levelRules(99).fallMs, 2500);
  },
  "multiplier steps up every three and caps"() {
    eq(multiplier(0), 1); eq(multiplier(2), 1); eq(multiplier(3), 2); eq(multiplier(999), RULES.maxMultiplier);
  },
  "shuffle keeps every item, and a seed replays the same order"() {
    const a = shuffle(IDS, seededRng(7)), b = shuffle(IDS, seededRng(7));
    eq(a.join(), b.join());
    eq(a.slice().sort().join(), IDS.join());
  },
  "a perfect bot clears levels, sees each region once per level, and loses no life"() {
    const game = createGame(IDS, seededRng(1));
    const log = play(game, (piece, s) => (s.level <= 5 ? piece.id : null));
    const clears = log.filter((e) => e.type === "levelclear").map((e) => e.level);
    eq(clears.slice(0, 5).join(), "1,2,3,4,5");
    const spawns = log.filter((e) => e.type === "spawn").map((e) => e.id);
    for (let l = 0; l < 5; l++) eq(spawns.slice(l * 7, l * 7 + 7).sort().join(), IDS.join(), `level ${l + 1} pieces`);
    eq(log.filter((e) => e.type === "miss").length, RULES.lives, "misses once it stops answering");
    eq(game.state.bestStreak, 35);
    eq(game.state.phase, "over");
  },
  "an idle bot loses exactly three pieces and scores nothing"() {
    const game = createGame(IDS, seededRng(2));
    const log = play(game, () => null);
    eq(log.filter((e) => e.type === "miss").length, 3);
    eq(game.state.score, 0);
    eq(log.at(-1).type, "over");
  },
  "a fast answer beats a slow one"() {
    const fast = createGame(IDS, seededRng(3)); fast.tick(0);
    const slow = createGame(IDS, seededRng(3)); slow.tick(0); slow.tick(8000);
    eq(fast.answer(fast.state.current.id)[0].points, 200);
    ok(slow.answer(slow.state.current.id)[0].points < 120, "slow answer scored too much");
  },
  "a wrong tap breaks the streak and halves the piece, but the piece stays in play"() {
    const game = createGame(IDS, seededRng(4));
    play(game, (piece, s) => (s.correct < 3 ? piece.id : null), 200);
    eq(game.state.streak, 3);
    while (!game.state.current) game.tick(50);
    const target = game.state.current.id;
    const other = IDS.find((id) => id !== target);
    eq(game.answer(other)[0].type, "wrong");
    eq(game.state.streak, 0);
    eq(game.state.current.id, target);
    const e = game.answer(target)[0];
    eq(e.type, "correct"); eq(e.mult, 1);
    ok(e.points <= 100, "corrected answer should be worth half");
  },
  "a clean level gives a life back, never above the maximum"() {
    const game = createGame(IDS, seededRng(5));
    const log = play(game, (piece, s) => {
      if (s.level === 1 && s.correct === 2 && s.lives === RULES.lives) return null; // let one fall in level 1
      return s.level <= 2 ? piece.id : null;
    });
    const [first, second] = log.filter((e) => e.type === "levelclear");
    eq(first.lifeBack, false, "level 1 was not clean:");
    eq(second.lifeBack, true, "level 2 was clean:");
  },
  "share text names the pack and the score"() {
    const text = shareText({ flag: "🇨🇷", title: "Costa Rica", subtitle: "Provincias" }, { score: 1234, level: 3, bestStreak: 9 }, "https://example.org/");
    ok(text.includes("Costa Rica") && text.includes("nivel 3") && text.endsWith("https://example.org/"), text);
  },
  async "every pack loads, and every label point lies in its own region only"() {
    const index = await loadJson("packs/index.json");
    ok(index.packs.length >= 1, "no packs listed");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.append(svg);
    try {
      for (const entry of index.packs) {
        const pack = await loadJson(`packs/${entry.id}.json`);
        eq(pack.id, entry.id);
        ok(pack.regions.length >= 2, `${pack.id}: too few regions`);
        eq(new Set(pack.regions.map((r) => r.id)).size, pack.regions.length, `${pack.id} unique ids:`);
        svg.setAttribute("viewBox", `0 0 ${pack.viewBox[0]} ${pack.viewBox[1]}`);
        const paths = pack.regions.map((r) => {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", r.d);
          svg.append(p);
          return p;
        });
        pack.regions.forEach((r, i) => {
          const pt = new DOMPoint(r.label[0], r.label[1]);
          paths.forEach((p, j) => eq(p.isPointInFill(pt), i === j, `${pack.id}: label of ${r.name} in region ${pack.regions[j].name}:`));
        });
        paths.forEach((p) => p.remove());
      }
    } finally { svg.remove(); }
  },
  async "the Costa Rica pack has the seven provinces"() {
    const pack = await loadJson("packs/cr-provincias.json");
    eq(pack.regions.map((r) => r.name).join(), "Alajuela,Cartago,Guanacaste,Heredia,Limón,Puntarenas,San José");
  },
  async "playing through the page: taps score, the game ends, the record is saved"() {
    const store = memoryStore();
    const app = createApp(document, store, seededRng(6));
    try {
      await app.showHome();
      ok(document.querySelector('#packs [data-pack="cr-provincias"]'), "home does not list the pack");
      ok(document.getElementById("credits").textContent.includes("OpenStreetMap"), "home does not credit the map data");
      await app.start("cr-provincias");
      app.stopLoop(); // the test drives time itself
      app.step(16);
      const first = app.game.state.current.id;
      const wrong = app.pack.regions.find((r) => r.id !== first).id;
      const tapOn = (id) => document.querySelector(`#map path[data-id="${id}"]`)
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      tapOn(wrong);
      eq(app.game.state.score, 0, "wrong tap:");
      tapOn(first);
      ok(app.game.state.score > 0, "correct tap did not score");
      ok(document.querySelector(`#map path[data-id="${first}"]`).classList.contains("placed"), "region not marked placed");
      app.setPaused(true);
      app.step(60000);
      eq(app.game.state.lives, RULES.lives, "time ran while paused:");
      app.setPaused(false);
      for (let i = 0; i < 5000 && app.game.state.phase !== "over"; i++) app.step(100);
      eq(document.getElementById("over").hidden, false, "game-over screen hidden:");
      eq(store.load().best["cr-provincias"].score, app.game.state.score);
    } finally {
      app.stopLoop();
      for (const id of ["home", "play", "over"]) document.getElementById(id).hidden = true;
    }
  },
};

export async function runSelftest(out) {
  const failures = [];
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
  }
  for (const id of ["home", "play", "over"]) document.getElementById(id).hidden = true;
  out.hidden = false;
  out.className = failures.length ? "fail" : "pass";
  out.textContent = failures.length
    ? `SELFTEST FAIL\n${failures.join("\n")}`
    : `SELFTEST PASS (${Object.keys(tests).length} tests)`;
}
