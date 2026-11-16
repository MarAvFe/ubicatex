// UI: screens, map rendering, input, the frame loop. Rules live in engine.js.
import {
  addScore, cleanInitials, createGame, levelRules, localDate, multiplier, num as fmt, rankFor, shareText, RULES,
} from "./engine.js";
import { silentSound } from "./sound.js";

const SVG = "http://www.w3.org/2000/svg";
const SCREENS = ["home", "play", "learn", "over", "scores"];
// Fill colours for placed regions, cycled by region order. Chosen to stay
// distinguishable from each other and from the unplaced cream.
const PALETTE = ["#f4a261", "#2a9d8f", "#e76f51", "#8ab17d", "#e9c46a", "#577590", "#b5838d", "#43aa8b", "#f28482"];
const CLUE_HINT = {
  both: "Nombre y silueta",
  name: "Solo el nombre",
  shape: "Solo la silueta",
  capital: "Solo la capital ★",
  mix: "Todo mezclado y más rápido",
};
// A tap this close (CSS px) to the right region counts as on it. Fingers are wider
// than the smallest regions; see docs/MAPS.md. tools/build_pack.py uses the same number.
const TAP_SLOP_PX = 14;

export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// opts: { makeSound, rng (tests) }
export function createApp(doc, store, opts = {}) {
  const $ = (id) => doc.getElementById(id);
  const saved = { scores: {}, initials: "", muted: false, lastPack: null, ...(store.load() ?? {}) };
  const save = () => store.save(saved);
  // Sound is decoration: a failure in it must never stop the game, as one once did.
  const sound = Object.fromEntries(Object.entries((opts.makeSound ?? silentSound)(() => saved.muted))
    .map(([name, fn]) => [name, (...args) => { try { fn(...args); } catch (err) { console.warn("sound", name, err); } }]));
  const listeners = new AbortController(); // lets the self-test remove every handler
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: listeners.signal });

  let index = null;
  let pack = null;
  let game = null;
  let paused = false;
  let frame = 0;
  // The falling piece's layout on the stage. Not called "piece": that name is taken by the
  // engine's piece in several functions, and shadowing it once put every piece at x = 0.
  const layout = { left: 0, w: 0, h: 0, scale: 1 };
  let bannerMs = 0;
  let lastResult = null;

  function show(screen) {
    for (const id of SCREENS) $(id).hidden = id !== screen;
    sound.music(screen !== "play");
  }

  const table = (id) => saved.scores[id] ?? [];

  // ---- Home ----

  async function showHome() {
    stopLoop();
    index ??= await loadJson("packs/index.json");
    const chosen = index.packs.find((p) => p.id === saved.lastPack) ?? index.packs[0];
    // A native dropdown with groups: it scales to any number of maps and phones
    // already know how to use it.
    const select = $("pack-select");
    select.replaceChildren();
    const groups = new Map();
    for (const p of index.packs) {
      if (!groups.has(p.group)) {
        const g = doc.createElement("optgroup");
        g.label = p.group;
        groups.set(p.group, g);
        select.append(g);
      }
      const opt = doc.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.flag} ${p.chip}`;
      groups.get(p.group).append(opt);
    }
    select.value = chosen.id;
    const best = table(chosen.id)[0];
    $("pack-sub").textContent = `${chosen.count} ${chosen.noun}` + (best ? ` · récord ${fmt(best.score)} (${best.name})` : "");
    $("play-free").onclick = () => start(chosen.id);
    $("show-map").onclick = () => showLearn(chosen.id);
    $("show-scores").onclick = () => showScores(chosen.id);
    // The data licences ask for credit where the map is offered, not only where it is drawn.
    $("credits").textContent = [...new Set(index.packs.flatMap((p) => p.attribution.split(" · ")))].join(" · ");
    drawMute();
    show("home");
  }

  function drawMute() {
    const text = saved.muted ? "🔇 Sonido apagado" : "🔊 Sonido encendido";
    $("mute").textContent = text;
    $("mute-pause").textContent = text;
  }
  function toggleMute() {
    saved.muted = !saved.muted;
    save();
    drawMute();
    sound.tap();
  }

  // ---- Map drawing (shared by play and the study map) ----

  async function usePack(packId) {
    if (!pack || pack.id !== packId) pack = await loadJson(`packs/${packId}.json`);
    saved.lastPack = packId;
    return pack;
  }

  function drawMap(svg, stage) {
    svg.setAttribute("viewBox", `0 0 ${pack.viewBox[0]} ${pack.viewBox[1]}`);
    svg.setAttribute("class", pack.theme === "sea" ? "sea" : "land");
    // World maps are twice as wide as tall: on a phone held upright they are a strip.
    stage.classList.toggle("wide", pack.viewBox[0] / pack.viewBox[1] > 1.6);
    svg.replaceChildren();
    // Neighbouring land, open water and the globe outline: context, never tappable.
    for (const bg of pack.background ?? []) {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", bg.d);
      path.setAttribute("class", `bg bg-${bg.kind}`);
      svg.append(path);
    }
    const labels = doc.createElementNS(SVG, "g");
    labels.setAttribute("class", "labels");
    pack.regions.forEach((r, i) => {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", r.d);
      path.setAttribute("class", "region");
      path.dataset.id = r.id;
      path.style.setProperty("--fill", PALETTE[i % PALETTE.length]);
      svg.append(path);
      const text = doc.createElementNS(SVG, "text");
      text.setAttribute("x", r.label[0]);
      text.setAttribute("y", r.label[1]);
      text.dataset.for = r.id;
      text.textContent = r.name;
      labels.append(text);
    });
    svg.append(labels); // after the paths so names are never covered
  }

  // Names keep the same size on screen whatever the map's scale: readable on a world
  // map, not huge on a single country.
  function sizeLabels(svg) {
    const ctm = svg.getScreenCTM?.();
    if (!ctm || !ctm.a) return;
    const px = doc.defaultView.innerWidth < 600 ? 12 : 16;
    svg.style.setProperty("--label-size", `${(px / ctm.a).toFixed(2)}px`);
  }

  const regionEl = (id, svg = $("map")) => svg.querySelector(`path[data-id="${id}"]`);
  const labelEl = (id, svg = $("map")) => svg.querySelector(`text[data-for="${id}"]`);

  function clearMap() {
    for (const el of $("map").querySelectorAll(".placed, .reveal, .shown, .peek")) {
      el.classList.remove("placed", "reveal", "shown", "peek");
    }
  }

  // A short colour pulse that leaves the region as it was (a wrong tap).
  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect(); // restart the animation on a repeat
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 800);
  }

  // Where a region's label point sits inside the stage, in CSS pixels.
  function stagePoint(region) {
    const ctm = $("map").getScreenCTM?.();
    const rect = $("stage").getBoundingClientRect();
    if (!ctm) return { x: rect.width / 2, y: rect.height / 2 };
    const pt = new DOMPoint(region.label[0], region.label[1]).matrixTransform(ctm);
    return { x: pt.x - rect.left, y: pt.y - rect.top };
  }

  // Which region a tap means. A tap on or within TAP_SLOP_PX of the piece's own
  // region is that region; otherwise it is whatever was under the finger.
  function regionAt(clientX, clientY, target) {
    const hit = target?.closest?.("path[data-id]")?.dataset.id ?? null;
    const wanted = game?.state.current?.id;
    if (!wanted || hit === wanted) return hit;
    const ctm = $("map").getScreenCTM?.();
    if (!ctm) return hit;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const reach = TAP_SLOP_PX / ctm.a;
    const path = regionEl(wanted);
    // Exact "within reach of the region": inside it, or inside a stroke of twice the
    // reach drawn along its edge. Sampling points around the tap misses thin slivers.
    const before = path.style.strokeWidth;
    path.style.strokeWidth = String(2 * reach);
    const near = path.isPointInFill(p) || path.isPointInStroke(p);
    path.style.strokeWidth = before;
    return near ? wanted : hit;
  }

  // ---- Falling piece ----

  // The horizontal extent of the drawn map inside the stage, in CSS pixels.
  function mapSpan() {
    const stage = $("stage").getBoundingClientRect();
    const ctm = $("map").getScreenCTM?.();
    if (!ctm || !pack) return [0, stage.width];
    const x0 = new DOMPoint(0, 0).matrixTransform(ctm).x - stage.left;
    const x1 = new DOMPoint(pack.viewBox[0], 0).matrixTransform(ctm).x - stage.left;
    return [Math.max(0, x0), Math.min(stage.width, x1)];
  }

  function drawPiece(spawned) {
    const region = pack.regions.find((r) => r.id === spawned.id);
    const el = $("piece");
    el.replaceChildren();
    if (spawned.clue === "both" || spawned.clue === "shape") {
      const svg = doc.createElementNS(SVG, "svg");
      const [x, y, w, h] = region.box;
      // Margin so the outline and its halo are not clipped.
      const m = Math.max(w, h) * 0.08;
      svg.setAttribute("viewBox", `${x - m} ${y - m} ${w + 2 * m} ${h + 2 * m}`);
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", region.d);
      svg.append(path);
      el.append(svg);
    }
    if (spawned.clue !== "shape") {
      const name = doc.createElement("span");
      name.textContent = spawned.clue === "capital" ? `★ ${region.capital}` : region.name;
      el.append(name);
    }
    el.classList.remove("zap", "lost");
    el.style.transition = "none";
    el.hidden = false;
    // Fit the piece to the screen: shrink it if it is wider than the stage (a long sea
    // name on a phone), and drop it somewhere above the map as drawn, which on a wide
    // desktop screen is much narrower than the stage. Its whole width stays on screen.
    const stageW = $("stage").clientWidth;
    const margin = 8;
    layout.w = el.offsetWidth;
    layout.h = el.offsetHeight;
    layout.scale = Math.min(1, (stageW - 2 * margin) / layout.w);
    const half = (layout.w * layout.scale) / 2;
    const [from, to] = mapSpan();
    const wanted = from + (to - from) * (0.2 + Math.random() * 0.6);
    layout.left = Math.min(Math.max(wanted, half + margin), stageW - half - margin);
    movePiece(0);
  }

  function movePiece(frac) {
    const stage = $("stage");
    const el = $("piece");
    const y = frac * Math.max(0, stage.clientHeight - layout.h * layout.scale);
    el.style.transform = `translate(${layout.left - (layout.w * layout.scale) / 2}px, ${y}px) scale(${layout.scale})`;
    $("timer").style.transform = `scaleX(${1 - frac})`;
    // The bar warns before the piece lands.
    $("timer").classList.toggle("low", frac > 0.7);
  }

  function zapPiece(region) {
    const el = $("piece");
    const p = stagePoint(region);
    const s = 0.2 * layout.scale;
    el.style.transition = "";
    el.classList.add("zap");
    el.style.transform = `translate(${p.x - (layout.w * s) / 2}px, ${p.y - (layout.h * s) / 2}px) scale(${s})`;
  }

  function floatText(at, text, cls) {
    const el = doc.createElement("div");
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    on(el, "animationend", () => el.remove());
    $("stage").append(el);
    // Reduced-motion users get no animation, so no animationend either.
    setTimeout(() => el.remove(), 1200);
  }

  function banner(title, sub, ms = 1500) {
    const el = $("banner");
    el.replaceChildren();
    const b = doc.createElement("b");
    b.textContent = title;
    el.append(b);
    if (sub) {
      const s = doc.createElement("span");
      s.textContent = sub;
      el.append(s);
    }
    el.hidden = false;
    bannerMs = ms;
  }

  // ---- HUD ----

  function drawHud() {
    const s = game.state;
    $("score").textContent = fmt(s.score);
    $("level").textContent = Math.max(1, s.level);
    const mult = multiplier(s.streak);
    $("combo").textContent = `×${mult}`;
    $("combo").classList.toggle("hot", mult > 1);
    $("lives").textContent = "♥".repeat(Math.max(0, s.lives)) + "♡".repeat(RULES.lives - Math.max(0, s.lives));
  }

  // ---- Game flow ----

  async function start(packId) {
    await usePack(packId);
    drawMap($("map"), $("stage"));
    game = createGame(pack.regions.map((r) => r.id), opts.rng ?? Math.random, { hasCapitals: pack.hasCapitals });
    paused = false;
    for (const id of ["paused", "piece", "banner", "review"]) $(id).hidden = true;
    show("play");
    sizeLabels($("map")); // needs the map on screen to measure
    drawHud();
    startLoop();
  }

  // End of a level (or of the game): a learning pause. The map shows what was placed,
  // and nothing moves until the player has looked and pressed the button.
  function showReview(e, gameOver) {
    for (const id of e.placed) {
      regionEl(id)?.classList.add("placed");
      labelEl(id)?.classList.add("shown");
    }
    $("piece").hidden = true;
    $("banner").hidden = true;
    const right = new Set(e.placed).size;
    $("review-title").textContent = gameOver ? "Fin del juego" : `Nivel ${e.level} superado`;
    $("review-sub").textContent = `${right} de ${e.total} ${pack.noun}` +
      (gameOver ? "" : ` · +${fmt(e.bonus)}${e.lifeBack ? " · +1 vida" : ""}`);
    $("review-next").textContent = gameOver ? "Ver resultado" : "Siguiente";
    $("review-next").onclick = () => {
      $("review").hidden = true;
      sound.tap();
      if (gameOver) finish();
      else game.next();
    };
    $("review").hidden = false;
  }

  function handle(events) {
    for (const e of events) {
      const region = e.id && pack.regions.find((r) => r.id === e.id);
      if (e.type === "level") {
        clearMap();
        banner(`Nivel ${e.level}`, CLUE_HINT[levelRules(e.level, pack.hasCapitals).clue], RULES.levelIntroMs);
      } else if (e.type === "spawn") {
        // A shown answer stays only until the next piece appears.
        for (const el of $("map").querySelectorAll(".reveal, .peek")) el.classList.remove("reveal", "peek");
        drawPiece(e);
      } else if (e.type === "correct") {
        regionEl(e.id).classList.add("placed");
        labelEl(e.id).classList.add("shown");
        zapPiece(region);
        floatText(stagePoint(region), `+${fmt(e.points)}${e.mult > 1 ? ` ×${e.mult}` : ""}`, "good");
        sound.good(e.mult);
      } else if (e.type === "wrong") {
        flash(regionEl(e.id), "wrong");
        sound.bad();
      } else if (e.type === "miss") {
        $("piece").classList.add("lost");
        if (e.reveal) {
          regionEl(e.id).classList.add("reveal");
          labelEl(e.id).classList.add("peek");
          floatText(stagePoint(region), "Era aquí", "bad");
        } else {
          const stage = $("stage");
          floatText({ x: stage.clientWidth / 2, y: stage.clientHeight - 40 }, "Volverá a caer", "bad");
        }
        sound.miss();
      } else if (e.type === "levelclear") {
        showReview(e, false);
        sound.levelUp();
      } else if (e.type === "over") {
        stopLoop();
        showReview(e, true);
        sound.over();
      }
    }
    if (events.length) drawHud();
  }

  function step(dtMs) {
    if (!game || paused) return;
    const phase = game.state.phase;
    if (phase === "over" || phase === "review") return;
    handle(game.tick(dtMs));
    const piece = game.state.current;
    if (piece) movePiece(piece.elapsed / piece.fallMs);
    if (bannerMs > 0 && (bannerMs -= dtMs) <= 0) $("banner").hidden = true;
  }

  function tap(id) {
    if (!game || paused || !id) return;
    handle(game.answer(id));
  }

  function finish() {
    stopLoop();
    const s = game.state;
    lastResult = { date: localDate(), score: s.score, level: s.level, bestStreak: s.bestStreak, correct: s.correct };
    const rank = rankFor(table(pack.id), s.score);
    $("over-pack").textContent = `${pack.flag} ${pack.title} · ${pack.subtitle}`;
    $("over-title").textContent = rank === 0 ? "¡Nuevo récord!" : "Fin del juego";
    $("over-score").textContent = fmt(s.score);
    $("over-level").textContent = s.level;
    $("over-correct").textContent = s.correct;
    $("over-streak").textContent = s.bestStreak;
    $("entry").hidden = rank === -1;
    $("over-actions").hidden = rank !== -1;
    $("share").textContent = "Compartir resultado";
    show("over");
    if (rank !== -1) {
      sound.record();
      $("initials").value = saved.initials;
      $("initials").focus?.();
    }
  }

  function submitInitials() {
    const name = cleanInitials($("initials").value);
    const { table: next, rank } = addScore(table(pack.id), {
      name, score: lastResult.score, level: lastResult.level, date: lastResult.date,
    });
    saved.scores[pack.id] = next;
    saved.initials = name;
    save();
    return showScores(pack.id, rank);
  }

  // ---- Study map: everything placed and named, to read before playing ----

  async function showLearn(packId) {
    await usePack(packId);
    const svg = $("learn-map");
    drawMap(svg, $("learn-stage"));
    for (const el of svg.querySelectorAll(".region")) el.classList.add("placed");
    for (const el of svg.querySelectorAll(".labels text")) el.classList.add("shown");
    $("learn-title").textContent = `${pack.flag} ${pack.title} · ${pack.subtitle}`;
    $("learn-info").textContent = "Toque una región para ver su nombre.";
    show("learn");
    sizeLabels(svg);
  }

  function learnTap(id) {
    const r = pack.regions.find((x) => x.id === id);
    if (!r) return;
    const svg = $("learn-map");
    for (const el of svg.querySelectorAll(".selected")) el.classList.remove("selected");
    regionEl(id, svg).classList.add("selected");
    $("learn-info").textContent = r.name + (pack.hasCapitals ? ` · capital: ${r.capital}` : "");
    sound.tap();
  }

  // ---- Top scores ----

  async function showScores(packId, highlight = -1) {
    await usePack(packId);
    $("scores-pack").textContent = `${pack.title} · ${pack.subtitle}`;
    const list = $("scores-list");
    list.replaceChildren();
    const rows = table(packId);
    for (let i = 0; i < RULES.topScores; i++) {
      const row = rows[i];
      const li = doc.createElement("li");
      if (i === highlight) li.className = "new";
      for (const text of [`${i + 1}`.padStart(2, " "), row?.name ?? "---", row ? fmt(row.score) : "0", row ? `N${row.level}` : ""]) {
        const cell = doc.createElement("span");
        cell.textContent = text;
        li.append(cell);
      }
      list.append(li);
    }
    $("scores-play").onclick = () => start(packId);
    show("scores");
  }

  async function share() {
    // A local link is useless to whoever receives the message.
    const host = doc.location.hostname;
    const local = !host || host === "localhost" || /^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host);
    const text = shareText(pack, lastResult, local ? "" : doc.location.origin + doc.location.pathname);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        $("share").textContent = "Copiado";
      }
    } catch { /* the player closed the share sheet */ }
  }

  function setPaused(value) {
    if (!game || game.state.phase === "over" || $("play").hidden) return;
    paused = value;
    $("paused").hidden = !value;
  }

  // ---- Frame loop ----

  function startLoop() {
    stopLoop();
    let last = null;
    const loop = (now) => {
      // A background tab can deliver one huge frame; never let it eat a whole piece.
      if (last !== null) step(Math.min(100, now - last));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  }
  function stopLoop() { cancelAnimationFrame(frame); }

  // ---- Wiring ----

  on(doc, "pointerdown", () => sound.unlock());
  on($("pack-select"), "change", (ev) => { sound.tap(); saved.lastPack = ev.target.value; save(); showHome(); });
  on($("map"), "pointerdown", (ev) => tap(regionAt(ev.clientX, ev.clientY, ev.target)));
  on($("learn-map"), "pointerdown", (ev) => learnTap(ev.target.closest?.("path[data-id]")?.dataset.id));
  on($("learn-back"), "click", () => showHome());
  on($("pause"), "click", () => setPaused(true));
  on($("resume"), "click", () => setPaused(false));
  on($("quit"), "click", () => showHome());
  on($("mute"), "click", toggleMute);
  on($("mute-pause"), "click", toggleMute);
  on($("again"), "click", () => start(pack.id));
  on($("share"), "click", share);
  on($("over-scores"), "click", () => showScores(pack.id));
  on($("home-btn"), "click", () => showHome());
  on($("scores-home"), "click", () => showHome());
  on($("entry"), "submit", (ev) => { ev.preventDefault(); submitInitials(); });
  on($("initials"), "input", (ev) => { ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  on(doc, "visibilitychange", () => { if (doc.hidden) setPaused(true); });
  on(doc.defaultView, "resize", () => {
    if (pack && !$("play").hidden) sizeLabels($("map"));
    if (pack && !$("learn").hidden) sizeLabels($("learn-map"));
  });
  on(doc, "keydown", (ev) => {
    if (ev.target === $("initials")) return;
    if (ev.key === "Escape" || ev.key === "p") setPaused(!paused);
    if ((ev.key === "Enter" || ev.key === " ") && !$("review").hidden) { ev.preventDefault(); $("review-next").click(); }
  });

  function destroy() { stopLoop(); sound.music(false); listeners.abort(); }

  return {
    showHome, start, step, tap, regionAt, setPaused, stopLoop, submitInitials, showScores, showLearn, learnTap, destroy,
    get game() { return game; }, get pack() { return pack; },
  };
}
