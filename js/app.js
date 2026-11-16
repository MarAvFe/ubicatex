// UI: screens, map rendering, input, the frame loop. Rules live in engine.js.
import {
  addScore, cleanInitials, createGame, dailySeed, levelRules, localDate, multiplier, rankFor,
  seededRng, shareText, RULES,
} from "./engine.js";
import { silentSound } from "./sound.js";

const SVG = "http://www.w3.org/2000/svg";
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
const MARK = { g: "🟩", y: "🟨", r: "🟥" };
const fmt = (n) => n.toLocaleString("es-CR");

export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// opts: { makeSound, rng (free play only; tests), today }
export function createApp(doc, store, opts = {}) {
  const $ = (id) => doc.getElementById(id);
  const saved = { scores: {}, daily: {}, initials: "", muted: false, lastPack: null, ...(store.load() ?? {}) };
  const save = () => store.save(saved);
  const sound = (opts.makeSound ?? silentSound)(() => saved.muted);
  const today = opts.today ?? localDate;
  const listeners = new AbortController(); // lets the self-test remove every handler
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: listeners.signal });

  let index = null;
  let pack = null;
  let game = null;
  let mode = "free";
  let paused = false;
  let frame = 0;
  let pieceX = 0.5;
  let bannerMs = 0;
  let lastResult = null;

  function show(screen) {
    for (const id of ["home", "play", "over", "scores"]) $(id).hidden = id !== screen;
    sound.music(screen !== "play");
  }

  const table = (id) => saved.scores[id] ?? [];
  const dailyDone = (id) => (saved.daily[id]?.date === today() ? saved.daily[id] : null);

  // ---- Home ----

  async function showHome() {
    stopLoop();
    index ??= await loadJson("packs/index.json");
    const chosen = index.packs.find((p) => p.id === saved.lastPack) ?? index.packs[0];
    const nav = $("picker");
    nav.replaceChildren();
    for (const p of index.packs) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.pack = p.id;
      btn.textContent = `${p.flag} ${p.title}`;
      btn.setAttribute("aria-pressed", String(p.id === chosen.id));
      on(btn, "click", () => { sound.tap(); saved.lastPack = p.id; save(); showHome(); });
      nav.append(btn);
    }
    nav.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
    $("pack-title").textContent = `${chosen.flag} ${chosen.title} · ${chosen.subtitle}`;
    const best = table(chosen.id)[0];
    $("pack-sub").textContent = `${chosen.count} ${chosen.noun}` + (best ? ` · récord ${fmt(best.score)} (${best.name})` : "");
    const done = dailyDone(chosen.id);
    $("play-daily").textContent = done ? "Ver el reto de hoy" : "Reto del día";
    $("daily-note").textContent = done ? `Hoy: ${fmt(done.score)} puntos ${done.marks.map((m) => MARK[m]).join("")}` : "";
    $("play-daily").onclick = () => (done ? showDailyResult(chosen.id) : start(chosen.id, "daily"));
    $("play-free").onclick = () => start(chosen.id, "free");
    $("show-scores").onclick = () => showScores(chosen.id);
    // The data licences ask for credit where the map is offered, not only where it is drawn.
    $("credits").textContent = [...new Set(index.packs.map((p) => p.attribution))].join(" · ") +
      " · Nombres y capitales: Wikidata";
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

  // ---- Map ----

  async function usePack(packId) {
    if (!pack || pack.id !== packId) pack = await loadJson(`packs/${packId}.json`);
    index ??= await loadJson("packs/index.json");
    return pack;
  }

  function drawMap() {
    const svg = $("map");
    svg.setAttribute("viewBox", `0 0 ${pack.viewBox[0]} ${pack.viewBox[1]}`);
    svg.style.setProperty("--label-size", `${pack.labelSize}px`);
    svg.replaceChildren();
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

  const regionEl = (id) => $("map").querySelector(`path[data-id="${id}"]`);
  const labelEl = (id) => $("map").querySelector(`text[data-for="${id}"]`);

  function clearMap() {
    for (const el of $("map").querySelectorAll(".placed, .reveal, .wrong, .shown")) {
      el.classList.remove("placed", "reveal", "wrong", "shown");
    }
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
    for (const share of [0.5, 1]) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const q = new DOMPoint(p.x + Math.cos(a) * reach * share, p.y + Math.sin(a) * reach * share);
        if (path.isPointInFill(q)) return wanted;
      }
    }
    return hit;
  }

  // ---- Falling piece ----

  function drawPiece(piece) {
    const region = pack.regions.find((r) => r.id === piece.id);
    const el = $("piece");
    el.replaceChildren();
    if (piece.clue === "both" || piece.clue === "shape") {
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
    if (piece.clue !== "shape") {
      const name = doc.createElement("span");
      name.textContent = piece.clue === "capital" ? `★ ${region.capital}` : region.name;
      el.append(name);
    }
    // Keep the piece inside the stage: 25%..75% of the width.
    pieceX = 0.25 + Math.random() * 0.5;
    el.classList.remove("zap", "lost");
    el.style.transition = "none";
    el.hidden = false;
    movePiece(0);
  }

  function movePiece(frac) {
    const stage = $("stage");
    const el = $("piece");
    const y = frac * Math.max(0, stage.clientHeight - el.offsetHeight);
    el.style.transform = `translate(${pieceX * stage.clientWidth}px, ${y}px) translateX(-50%)`;
    $("timer").style.transform = `scaleX(${1 - frac})`;
    // The bar warns before the piece lands.
    $("timer").classList.toggle("low", frac > 0.7);
  }

  function zapPiece(region) {
    const el = $("piece");
    const p = stagePoint(region);
    el.style.transition = "";
    el.classList.add("zap");
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(0.2)`;
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
    $("level-label").textContent = s.daily ? "Pieza" : "Nivel";
    $("level").textContent = s.daily ? `${Math.min(s.total, s.marks.length + 1)}/${s.total}` : Math.max(1, s.level);
    const mult = multiplier(s.streak);
    $("combo").textContent = `×${mult}`;
    $("combo").classList.toggle("hot", mult > 1);
    $("lives").hidden = s.daily;
    $("lives").textContent = "♥".repeat(Math.max(0, s.lives)) + "♡".repeat(RULES.lives - Math.max(0, s.lives));
  }

  // ---- Game flow ----

  async function start(packId, newMode = "free") {
    await usePack(packId);
    mode = newMode;
    saved.lastPack = packId;
    drawMap();
    // The daily game is seeded by map and date, so everyone gets the same ten pieces.
    const rng = mode === "daily" ? seededRng(dailySeed(packId, today())) : (opts.rng ?? Math.random);
    game = createGame(pack.regions.map((r) => r.id), rng, { hasCapitals: pack.hasCapitals, daily: mode === "daily" });
    paused = false;
    $("paused").hidden = true;
    $("piece").hidden = true;
    $("banner").hidden = true;
    show("play");
    drawHud();
    startLoop();
  }

  function handle(events) {
    for (const e of events) {
      const region = e.id && pack.regions.find((r) => r.id === e.id);
      if (e.type === "level") {
        clearMap();
        if (game.state.daily) banner("Reto del día", `${game.state.total} piezas`);
        else banner(`Nivel ${e.level}`, CLUE_HINT[levelRules(e.level, pack.hasCapitals).clue]);
      } else if (e.type === "spawn") {
        drawPiece(e);
      } else if (e.type === "correct") {
        regionEl(e.id).classList.add("placed");
        labelEl(e.id).classList.add("shown");
        zapPiece(region);
        floatText(stagePoint(region), `+${fmt(e.points)}${e.mult > 1 ? ` ×${e.mult}` : ""}`, "good");
        sound.good(e.mult);
      } else if (e.type === "wrong") {
        const el = regionEl(e.id);
        if (el) {
          el.classList.remove("wrong");
          void el.getBoundingClientRect(); // restart the animation on a repeated wrong tap
          el.classList.add("wrong");
        }
        sound.bad();
      } else if (e.type === "miss") {
        $("piece").classList.add("lost");
        if (e.reveal) {
          regionEl(e.id).classList.add("reveal");
          labelEl(e.id).classList.add("shown");
          floatText(stagePoint(region), "Era aquí", "bad");
        } else {
          const stage = $("stage");
          floatText({ x: stage.clientWidth / 2, y: stage.clientHeight - 40 }, "Volverá a caer", "bad");
        }
        sound.miss();
      } else if (e.type === "levelclear") {
        banner("Nivel superado", `+${fmt(e.bonus)}${e.lifeBack ? " · +1 vida" : ""}`, 1700);
        sound.levelUp();
      } else if (e.type === "over") {
        finish();
      }
    }
    if (events.length) drawHud();
  }

  function step(dtMs) {
    if (!game || paused || game.state.phase === "over") return;
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
    lastResult = {
      daily: s.daily, date: today(), score: s.score, level: s.level, bestStreak: s.bestStreak,
      correct: s.correct, marks: s.marks.slice(),
    };
    if (s.daily) {
      // Only the first attempt of the day counts, as it would on paper.
      if (!dailyDone(pack.id)) {
        saved.daily[pack.id] = { date: lastResult.date, score: s.score, marks: lastResult.marks };
        save();
      }
    }
    showOver(lastResult);
    if (!s.daily && rankFor(table(pack.id), s.score) !== -1) sound.record(); else sound.over();
  }

  function showOver(result) {
    const rank = result.daily ? -1 : rankFor(table(pack.id), result.score);
    const entering = rank !== -1 && !result.saved;
    $("over-pack").textContent = `${pack.flag} ${pack.title} · ${pack.subtitle}`;
    $("over-title").textContent = result.daily ? `Reto del ${result.date}` : rank === 0 ? "¡Nuevo récord!" : "Fin del juego";
    $("over-score").textContent = fmt(result.score);
    $("over-marks").hidden = !result.daily;
    $("over-marks").textContent = result.marks.map((m) => MARK[m]).join("");
    $("over-stats").hidden = result.daily;
    $("over-level").textContent = result.level;
    $("over-correct").textContent = result.correct;
    $("over-streak").textContent = result.bestStreak;
    $("over-note").hidden = !result.daily;
    $("over-note").textContent = "Mañana hay un reto nuevo. Mientras tanto, el juego libre no tiene límite.";
    $("entry").hidden = !entering;
    $("over-actions").hidden = entering;
    $("again").textContent = result.daily ? "Juego libre" : "Jugar otra vez";
    $("share").textContent = "Compartir resultado";
    show("over");
    if (entering) {
      $("initials").value = saved.initials;
      $("initials").focus?.();
    }
  }

  async function showDailyResult(packId) {
    await usePack(packId);
    const d = dailyDone(packId);
    lastResult = { daily: true, date: d.date, score: d.score, marks: d.marks, level: 1, bestStreak: 0, correct: 0 };
    showOver(lastResult);
  }

  function submitInitials() {
    const name = cleanInitials($("initials").value);
    const { table: next, rank } = addScore(table(pack.id), {
      name, score: lastResult.score, level: lastResult.level, date: lastResult.date,
    });
    saved.scores[pack.id] = next;
    saved.initials = name;
    save();
    lastResult.saved = true;
    return showScores(pack.id, rank);
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
    $("scores-play").onclick = () => start(packId, "free");
    show("scores");
  }

  async function share() {
    // A localhost link is useless to whoever receives the message.
    const local = ["localhost", "127.0.0.1", ""].includes(doc.location.hostname);
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
  on($("map"), "pointerdown", (ev) => tap(regionAt(ev.clientX, ev.clientY, ev.target)));
  on($("pause"), "click", () => setPaused(true));
  on($("resume"), "click", () => setPaused(false));
  on($("quit"), "click", () => showHome());
  on($("mute"), "click", toggleMute);
  on($("mute-pause"), "click", toggleMute);
  on($("again"), "click", () => start(pack.id, "free"));
  on($("share"), "click", share);
  on($("over-scores"), "click", () => showScores(pack.id));
  on($("home-btn"), "click", () => showHome());
  on($("scores-home"), "click", () => showHome());
  on($("entry"), "submit", (ev) => { ev.preventDefault(); submitInitials(); });
  on($("initials"), "input", (ev) => { ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  on(doc, "visibilitychange", () => { if (doc.hidden) setPaused(true); });
  on(doc, "keydown", (ev) => {
    if (ev.target === $("initials")) return;
    if (ev.key === "Escape" || ev.key === "p") setPaused(!paused);
  });

  function destroy() { stopLoop(); sound.music(false); listeners.abort(); }

  return {
    showHome, start, step, tap, regionAt, setPaused, stopLoop, submitInitials, showScores, destroy,
    get game() { return game; }, get pack() { return pack; },
  };
}
