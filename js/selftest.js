// Self-test: open index.html#selftest, or run ./selftest.sh. Runs on in-memory
// storage, never on the player's saved records.
import {
  addScore, cleanInitials, createGame, dailySeed, levelRules, multiplier, num, rankFor, seededRng, shareText, shuffle, RULES,
} from "./engine.js";
import { createApp, loadJson } from "./app.js";
import { memoryStore } from "./store.js";
import { createSound, silentSound } from "./sound.js";

const IDS = ["a", "b", "c", "d", "e", "f", "g"];

function eq(actual, expected, what = "") {
  if (actual !== expected) throw new Error(`${what} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond, what) { if (!cond) throw new Error(what); }

// Bots drive the engine in 50 ms steps, as a browser frame loop would.
function play(game, decide, maxSteps = 200000) {
  const log = [];
  for (let i = 0; i < maxSteps && game.state.phase !== "over"; i++) {
    if (game.state.phase === "review") game.next(); // the bot has seen the level
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
  "a level's first piece waits until the level's title has shown"() {
    const game = createGame(IDS, seededRng(15));
    const events = game.tick(50);
    eq(events.map((e) => e.type).join(), "level");
    eq(game.state.current, null);
    let waited = 0;
    while (!game.state.current) { game.tick(50); waited += 50; }
    ok(waited >= RULES.levelIntroMs, `first piece after ${waited} ms`);
  },
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
    const firstPiece = (g) => { while (!g.state.current) g.tick(50); return g; };
    const fast = firstPiece(createGame(IDS, seededRng(3)));
    const slow = firstPiece(createGame(IDS, seededRng(3))); slow.tick(8000);
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
  "with capitals, a capital level follows the shape level, and mixed levels use all three clues"() {
    eq(levelRules(4, true).clue, "capital");
    eq(levelRules(4, false).clue, "mix");
    eq(levelRules(5, true).clue, "mix");
    const game = createGame(IDS, seededRng(8), { hasCapitals: true });
    const log = play(game, (piece, s) => (s.level <= 6 ? piece.id : null));
    const clues = (level) => new Set(log.filter((e) => e.type === "spawn").slice((level - 1) * 7, level * 7).map((e) => e.clue));
    eq([...clues(4)].join(), "capital");
    eq([...clues(5), ...clues(6)].filter((c, i, a) => a.indexOf(c) === i).sort().join(), "capital,name,shape");
  },
  "a miss shows the answer in levels 1 and 2 only; later the piece comes back and the region stays empty"() {
    const game = createGame(IDS, seededRng(9));
    let dropped = null;
    const log = play(game, (piece, s) => {
      if (s.level === 1 && s.lives === RULES.lives) return null;    // one miss in level 1
      // one miss in level 3: let its first piece fall all the way (the clean level 2 restored the life)
      if (s.level === 3 && (dropped === null || (piece.id === dropped && s.lives === RULES.lives))) { dropped = piece.id; return null; }
      return s.level <= 3 ? piece.id : null;
    }, 4000);
    const misses = log.filter((e) => e.type === "miss");
    eq(misses[0].reveal, true, "level 1 miss:");
    eq(misses[1].reveal, false, "level 3 miss:");
    eq(misses[1].id, dropped);
    const level3 = log.slice(log.findIndex((e) => e.type === "level" && e.level === 3));
    const end = level3.findIndex((e) => e.type === "levelclear");
    const spawns = level3.slice(0, end).filter((e) => e.type === "spawn").map((e) => e.id);
    eq(spawns.length, 8, "level 3 pieces (7 + the one that came back):");
    eq(spawns.at(-1), dropped, "the dropped piece returns last:");
    ok(level3.slice(0, end).some((e) => e.type === "correct" && e.id === dropped), "the returned piece was never placed");
  },
  "the daily challenge is the same for the same day, different the next, and has no lives"() {
    const BIG = Array.from({ length: 22 }, (_, i) => `r${i}`);
    const run = (ids, date, decide) => {
      const game = createGame(ids, seededRng(dailySeed("x", date)), { daily: true, hasCapitals: true });
      const log = play(game, decide);
      return { game, spawns: log.filter((e) => e.type === "spawn"), order: log.filter((e) => e.type === "spawn").map((e) => e.id + e.clue).join() };
    };
    const a = run(BIG, "2026-11-16", (p) => p.id), b = run(BIG, "2026-11-16", (p) => p.id), c = run(BIG, "2026-11-17", (p) => p.id);
    eq(a.order, b.order);
    ok(a.order !== c.order, "two days gave the same challenge");
    eq(a.game.state.marks.join(""), "g".repeat(RULES.dailyPieces), "a big map plays ten:");
    const idle = run(BIG, "2026-11-16", () => null);
    eq(idle.game.state.marks.join(""), "r".repeat(RULES.dailyPieces));
    eq(idle.game.state.phase, "over");
    eq(idle.game.state.lives, RULES.lives, "daily must not use lives:");
  },
  "a daily on a map with fewer than ten regions plays each region exactly once"() {
    // Regression: seven-region maps used to be padded to ten, so three pieces fell
    // onto places that were already filled in.
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = createGame(IDS, seededRng(seed), { daily: true });
      const spawns = play(game, (p) => p.id).filter((e) => e.type === "spawn").map((e) => e.id);
      eq(spawns.length, IDS.length, `seed ${seed} pieces:`);
      eq(new Set(spawns).size, IDS.length, `seed ${seed} repeats a region:`);
      eq(game.state.total, IDS.length);
    }
  },
  "a cleared level waits for next() and reports what was placed"() {
    const game = createGame(IDS, seededRng(11));
    let dropped = false;
    for (let i = 0; i < 2000 && game.state.phase !== "review"; i++) {
      game.tick(50);
      const p = game.state.current;
      if (p && !(p.id === "c" && !dropped)) game.answer(p.id);
      if (p && p.id === "c" && p.elapsed >= p.fallMs - 50) dropped = true;
    }
    eq(game.state.phase, "review");
    for (let i = 0; i < 100; i++) eq(game.tick(1000).length, 0, "time moved during the review:");
    game.next();
    const events = [];
    for (let i = 0; i < 100 && !events.some((e) => e.type === "spawn"); i++) events.push(...game.tick(50));
    eq(events[0].type, "level");
    eq(events[0].level, 2);
  },
  "numbers are written with commas, without spaces"() {
    eq(num(1130), "1,130"); eq(num(25), "25"); eq(num(1234567), "1,234,567");
  },
  "the score table keeps the best ten in order, and initials are three clean characters"() {
    let table = [];
    for (const score of [50, 300, 100, 200, 10, 20, 30, 40, 60, 70, 80, 90]) table = addScore(table, { name: "AAA", score }).table;
    eq(table.length, 10);
    eq(table.map((r) => r.score).join(), "300,200,100,90,80,70,60,50,40,30");
    eq(rankFor(table, 25), -1); eq(rankFor(table, 250), 1); eq(rankFor([], 0), -1);
    eq(rankFor(table, 100), 3, "a tie ranks below the earlier score:");
    eq(cleanInitials("mñ4x"), "MN4"); eq(cleanInitials("é"), "EAA"); eq(cleanInitials("  "), "AAA");
  },
  "share text names the pack and the score, and the daily one shows the grid"() {
    const pack = { flag: "🇨🇷", title: "Costa Rica", subtitle: "Provincias" };
    const text = shareText(pack, { score: 1234, level: 3, bestStreak: 9 }, "https://example.org/");
    ok(text.includes("Costa Rica") && text.includes("nivel 3") && text.endsWith("https://example.org/"), text);
    const daily = shareText(pack, { daily: true, date: "2026-11-16", score: 900, marks: ["g", "y", "r"] });
    ok(daily.includes("🟩🟨🟥") && daily.includes("2026-11-16") && !daily.includes("http"), daily);
  },
  async "every pack loads, names are clean, and every label point lies in its own region only"() {
    const index = await loadJson("packs/index.json");
    eq(index.packs.length, 13, "packs listed:");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.append(svg);
    try {
      for (const entry of index.packs) {
        const pack = await loadJson(`packs/${entry.id}.json`);
        eq(pack.id, entry.id);
        eq(pack.regions.length, entry.count, `${pack.id} count:`);
        eq(new Set(pack.regions.map((r) => r.id)).size, pack.regions.length, `${pack.id} unique ids:`);
        eq(new Set(pack.regions.map((r) => r.name)).size, pack.regions.length, `${pack.id} unique names:`);
        for (const r of pack.regions) {
          ok(!/^(departamento|provincia|distrito|comarca|regi)/i.test(r.name), `${pack.id}: name not cleaned: ${r.name}`);
          ok(!pack.hasCapitals || (r.capital && !r.capital.includes("(")), `${pack.id}: bad capital for ${r.name}`);
        }
        svg.setAttribute("viewBox", `0 0 ${pack.viewBox[0]} ${pack.viewBox[1]}`);
        const paths = pack.regions.map((r) => {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", r.d);
          svg.append(p);
          return p;
        });
        pack.regions.forEach((r, i) => {
          const pt = new DOMPoint(r.label[0], r.label[1]);
          ok(paths[i].isPointInFill(pt), `${pack.id}: label of ${r.name} is outside it`);
          // Neighbouring countries come from different surveys and may overlap by a sliver;
          // the label point must still belong to one region only.
          paths.forEach((p, j) => ok(i === j || !p.isPointInFill(pt), `${pack.id}: label of ${r.name} is also inside ${pack.regions[j].name}`));
        });
        paths.forEach((p) => p.remove());
      }
    } finally { svg.remove(); }
  },
  async "region counts match what the sources hold"() {
    const want = { "mundo-continentes": 6, "mundo-oceanos": 5, "mundo-mares": 22, "norteamerica-paises": 4,
      "sudamerica-paises": 13, "centroamerica-paises": 7, "cr-provincias": 7, "gt-departamentos": 22, "bz-distritos": 6,
      "sv-departamentos": 14, "hn-departamentos": 18, "ni-departamentos": 17, "pa-provincias": 13 };
    const index = await loadJson("packs/index.json");
    for (const p of index.packs) eq(p.count, want[p.id], `${p.id}:`);
    const cr = await loadJson("packs/cr-provincias.json");
    eq(cr.regions.map((r) => r.name).join(), "Alajuela,Cartago,Guanacaste,Heredia,Limón,Puntarenas,San José");
    // Province capitals are not verified yet, so province maps have no capital level.
    eq(cr.hasCapitals, false, "province map with capitals:");
    ok(cr.regions.every((r) => !("capital" in r)), "a province map carries capitals");
    eq((await loadJson("packs/centroamerica-paises.json")).hasCapitals, true, "country map without capitals:");
    const world = await loadJson("packs/mundo-continentes.json");
    eq(world.regions.map((r) => r.name).join(), "América,Antártida,Asia,Europa,Oceanía,África");
    eq(world.hasCapitals, false, "continents have no capitals:");
    const oceans = await loadJson("packs/mundo-oceanos.json");
    eq(oceans.regions.map((r) => r.name).join(), "Atlántico,Austral,Pacífico,Ártico,Índico");
    const south = await loadJson("packs/sudamerica-paises.json");
    eq(south.regions.find((r) => r.name === "Bolivia").capital, "La Paz / Sucre");
    ok(south.regions.some((r) => r.name === "Guayana Francesa"), "French Guiana missing");
    const north = await loadJson("packs/norteamerica-paises.json");
    eq(north.regions.map((r) => r.name).join(), "Canadá,Estados Unidos,Groenlandia,México");
  },
  async "playing through the page: taps score, near-misses on small regions count, the game ends in the table"() {
    const store = memoryStore();
    const app = createApp(document, store, { rng: seededRng(6), today: () => "2026-11-16" });
    const tapOn = (id) => document.querySelector(`#map path[data-id="${id}"]`)
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    try {
      await app.showHome();
      eq(document.querySelectorAll("#pack-select option").length, 13, "maps in the dropdown:");
      eq([...document.querySelectorAll("#pack-select optgroup")].map((g) => g.label).join(), "Mundo,América,Provincias de Centroamérica");
      ok(document.getElementById("credits").textContent.includes("OpenStreetMap"), "home does not credit the map data");
      await app.start("cr-provincias");
      app.stopLoop(); // the test drives time itself
      while (!app.game.state.current) app.step(50); // the level's title shows first
      const first = app.game.state.current.id;
      const wrong = app.pack.regions.find((r) => r.id !== first).id;
      tapOn(wrong);
      eq(app.game.state.score, 0, "wrong tap:");
      tapOn(first);
      ok(app.game.state.score > 0, "correct tap did not score");
      eq([...document.querySelectorAll("#map .placed")].map((p) => p.dataset.id).join(), first, "the right answer is not filled in:");
      app.setPaused(true);
      app.step(60000);
      eq(app.game.state.lives, RULES.lives, "time ran while paused:");
      app.setPaused(false);
      for (let i = 0; i < 5000 && app.game.state.phase !== "over"; i++) app.step(100);
      eq(document.getElementById("review").hidden, false, "no review before the results:");
      eq(document.getElementById("review-next").textContent, "Ver resultado");
      eq([...document.querySelectorAll("#map .placed")].map((p) => p.dataset.id).join(), first, "only the right answer is coloured:");
      document.getElementById("review-next").click();
      eq(document.getElementById("over").hidden, false, "game-over screen hidden:");
      ok(/^\d{1,3}(,\d{3})*$/.test(document.getElementById("over-score").textContent), "score format: " + document.getElementById("over-score").textContent);
      eq(document.getElementById("entry").hidden, false, "initials form hidden:");
      document.getElementById("initials").value = "mav";
      await app.submitInitials();
      eq(document.getElementById("scores").hidden, false, "score table hidden:");
      eq(store.load().scores["cr-provincias"][0].name, "MAV");
      eq(store.load().scores["cr-provincias"][0].score, app.game.state.score);
      ok(document.querySelector("#scores-list li.new").textContent.includes("MAV"), "new row not highlighted");

      // Tap forgiveness, on the smallest region of all: the Bay Islands of Honduras.
      await app.start("hn-departamentos");
      app.stopLoop();
      for (let i = 0; i < 400 && app.game.state.current?.id !== "HN-IB"; i++) {
        if (app.game.state.phase === "review") document.getElementById("review-next").click();
        app.step(16);
        if (app.game.state.current && app.game.state.current.id !== "HN-IB") app.tap(app.game.state.current.id);
      }
      eq(app.game.state.current?.id, "HN-IB", "could not reach the Bay Islands piece:");
      const island = app.pack.regions.find((r) => r.id === "HN-IB");
      const ctm = document.getElementById("map").getScreenCTM();
      const at = new DOMPoint(island.label[0], island.label[1]).matrixTransform(ctm);
      const sea = document.getElementById("map");
      eq(app.regionAt(at.x, at.y - 9, sea), "HN-IB", "9 px off the island:");
      ok(app.regionAt(at.x, at.y - 60, sea) !== "HN-IB", "60 px off the island still counted");
    } finally { app.destroy(); }
  },
  async "background land and water are drawn but never count as a tap"() {
    const app = createApp(document, memoryStore(), { rng: seededRng(3) });
    try {
      await app.start("mundo-oceanos");
      app.stopLoop();
      app.step(16);
      const bg = document.querySelectorAll("#map path.bg");
      ok(bg.length >= 2, "background layers not drawn");
      eq(getComputedStyle(bg[0]).pointerEvents, "none");
      eq(app.regionAt(-9999, -9999, bg[bg.length - 1]), null, "a tap on land picked a region:");
      ok(document.getElementById("map").classList.contains("sea"), "ocean map without the sea theme");
    } finally { app.destroy(); }
  },
  async "a cleared level shows its answers and waits for Siguiente; the next level starts white"() {
    const app = createApp(document, memoryStore(), { rng: seededRng(12) });
    try {
      await app.start("cr-provincias");
      app.stopLoop();
      let skipped = null;
      for (let i = 0; i < 3000 && app.game.state.phase !== "review"; i++) {
        app.step(50);
        const p = app.game.state.current;
        if (!p) continue;
        if (skipped === null) skipped = p.id;      // let the first piece fall
        if (p.id !== skipped) app.tap(p.id);
      }
      eq(app.game.state.phase, "review");
      eq(document.getElementById("review").hidden, false, "review hidden:");
      ok(document.getElementById("review-sub").textContent.startsWith("6 de 7"), document.getElementById("review-sub").textContent);
      eq(document.querySelectorAll("#map .placed").length, 6, "coloured regions:");
      ok(!document.querySelector(`#map path[data-id="${skipped}"]`).classList.contains("placed"), "the missed region is coloured");
      eq(document.querySelectorAll("#map .labels text.shown").length, 6, "names shown:");
      app.step(60000);
      eq(app.game.state.phase, "review", "the game moved on by itself:");
      document.getElementById("review-next").click();
      for (let i = 0; i < 100 && !app.game.state.current; i++) app.step(50);
      eq(app.game.state.level, 2);
      eq(document.querySelectorAll("#map .placed").length, 0, "level 2 did not start white:");
    } finally { app.destroy(); }
  },
  async "the study map shows every region named, and a tap tells the name and capital"() {
    const app = createApp(document, memoryStore());
    try {
      await app.showLearn("centroamerica-paises");
      eq(document.getElementById("learn").hidden, false);
      eq(document.querySelectorAll("#learn-map .region.placed").length, 7);
      eq(document.querySelectorAll("#learn-map .labels text.shown").length, 7);
      app.learnTap("CR");
      eq(document.getElementById("learn-info").textContent, "Costa Rica · capital: San José");
      await app.showLearn("cr-provincias");
      app.learnTap("CR-G");
      eq(document.getElementById("learn-info").textContent, "Guanacaste", "province maps show no capital:");
    } finally { app.destroy(); }
  },
  "sound never throws, at any multiplier"() {
    // Regression: at ×5 the chime read past the end of its scale and threw, which froze
    // the game at the end of the continents' second level.
    const s = createSound(() => false);
    s.unlock();
    for (let m = 0; m <= 12; m++) s.good(m);
    s.bad(); s.miss(); s.levelUp(); s.over(); s.record(); s.tap();
    s.music(true); s.music(false);
  },
  async "a failing sound cannot stop a level from ending"() {
    const broken = () => Object.fromEntries(Object.keys(silentSound()).map((k) => [k, () => { throw new Error("no audio"); }]));
    const app = createApp(document, memoryStore(), { rng: seededRng(13), makeSound: broken });
    try {
      await app.start("mundo-continentes");
      app.stopLoop();
      for (let i = 0; i < 3000 && app.game.state.phase !== "review"; i++) {
        app.step(50);
        if (app.game.state.current) app.tap(app.game.state.current.id);
      }
      eq(document.getElementById("review").hidden, false, "no Siguiente after a sound error:");
    } finally { app.destroy(); }
  },
  async "a falling piece always fits on a narrow phone screen"() {
    const play = document.getElementById("play");
    play.style.width = "340px"; // a small phone
    const app = createApp(document, memoryStore(), { rng: seededRng(14) });
    try {
      for (const id of ["mundo-mares", "mundo-oceanos"]) {
        await app.start(id);
        app.stopLoop();
        const stage = document.getElementById("stage").getBoundingClientRect();
        let checked = 0;
        for (let i = 0; i < 6000 && checked < 12; i++) {
          if (app.game.state.phase === "review") document.getElementById("review-next").click();
          app.step(50);
          const p = app.game.state.current;
          if (p && p.elapsed === 50) {
            const r = document.getElementById("piece").getBoundingClientRect();
            ok(r.left >= stage.left - 0.5 && r.right <= stage.right + 0.5,
              `${id}: piece ${p.id} (${p.clue}) spans ${Math.round(r.left)}..${Math.round(r.right)}, stage ${Math.round(stage.left)}..${Math.round(stage.right)}`);
            checked++;
            app.tap(p.id);
          }
        }
        ok(checked >= 5, `${id}: only ${checked} pieces checked`);
      }
    } finally { app.destroy(); play.style.width = ""; }
  },
  async "the home menu offers Jugar, Mapa and Mejores puntajes, and no daily challenge"() {
    const app = createApp(document, memoryStore());
    try {
      await app.showHome();
      const labels = [...document.querySelectorAll("#home .card button")].map((b) => b.textContent);
      eq(labels.join(), "Jugar,Mapa,Mejores puntajes");
      eq(document.getElementById("play-daily"), null, "daily button still in the page:");
      eq([...document.querySelectorAll("#home summary")].map((s) => s.textContent).join(), "Cómo jugar,Fuentes");
      ok(document.querySelectorAll("#home details[open]").length === 0, "rules or sources open by default");
      const select = document.getElementById("pack-select");
      select.value = "sudamerica-paises";
      select.dispatchEvent(new Event("change"));
      await new Promise((r) => setTimeout(r, 50));
      eq(document.getElementById("pack-select").value, "sudamerica-paises", "the choice did not stick:");
      ok(document.getElementById("pack-sub").textContent.startsWith("13 países"), document.getElementById("pack-sub").textContent);
    } finally { app.destroy(); }
  },
};

export async function runSelftest(out) {
  const failures = [];
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
  }
  for (const id of ["home", "play", "learn", "over", "scores"]) document.getElementById(id).hidden = true;
  out.hidden = false;
  out.className = failures.length ? "fail" : "pass";
  out.textContent = failures.length
    ? `SELFTEST FAIL\n${failures.join("\n")}`
    : `SELFTEST PASS (${Object.keys(tests).length} tests)`;
}
