// UI: screens, map rendering, input, the frame loop. Rules live in engine.js.
import { createGame, levelRules, multiplier, shareText, RULES } from "./engine.js";

const SVG = "http://www.w3.org/2000/svg";
// Fill colours for placed regions, cycled by region order. Chosen to stay
// distinguishable from each other and from the unplaced cream.
const PALETTE = ["#f4a261", "#2a9d8f", "#e76f51", "#8ab17d", "#e9c46a", "#577590", "#b5838d", "#43aa8b", "#f28482"];
const CLUE_HINT = {
  both: "Nombre y silueta",
  name: "Solo el nombre",
  shape: "Solo la silueta",
  mix: "Más rápido",
};
const fmt = (n) => n.toLocaleString("es-CR");

export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export function createApp(doc, store, rng = Math.random) {
  const $ = (id) => doc.getElementById(id);
  const saved = store.load() ?? { best: {} };
  let pack = null;
  let game = null;
  let paused = false;
  let frame = 0;
  let pieceX = 0.5;
  let bannerMs = 0;

  function show(screen) {
    for (const id of ["home", "play", "over"]) $(id).hidden = id !== screen;
  }

  // ---- Home ----

  async function showHome() {
    stopLoop();
    const index = await loadJson("packs/index.json");
    const box = $("packs");
    box.replaceChildren();
    for (const p of index.packs) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "pack";
      btn.dataset.pack = p.id;
      const best = saved.best[p.id];
      btn.innerHTML = `<span class="flag"></span><span class="names"><b></b><small></small></span><span class="go">Jugar</span>`;
      btn.querySelector(".flag").textContent = p.flag;
      btn.querySelector("b").textContent = `${p.title} · ${p.subtitle}`;
      btn.querySelector("small").textContent = best ? `Récord: ${fmt(best.score)} · nivel ${best.level}` : "Sin récord todavía";
      btn.addEventListener("click", () => start(p.id));
      box.append(btn);
    }
    // The data licence asks for credit where the map is offered, not only where it is drawn.
    $("credits").textContent = [...new Set(index.packs.map((p) => p.attribution))].join(" · ");
    show("home");
  }

  // ---- Map ----

  function drawMap() {
    const svg = $("map");
    svg.setAttribute("viewBox", `0 0 ${pack.viewBox[0]} ${pack.viewBox[1]}`);
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
    const svg = $("map");
    const ctm = svg.getScreenCTM?.();
    const rect = $("stage").getBoundingClientRect();
    if (!ctm) return { x: rect.width / 2, y: rect.height / 2 };
    const pt = new DOMPoint(region.label[0], region.label[1]).matrixTransform(ctm);
    return { x: pt.x - rect.left, y: pt.y - rect.top };
  }

  // ---- Falling piece ----

  function drawPiece(piece) {
    const region = pack.regions.find((r) => r.id === piece.id);
    const el = $("piece");
    el.replaceChildren();
    if (piece.clue !== "name") {
      const svg = doc.createElementNS(SVG, "svg");
      const [x, y, w, h] = region.box;
      svg.setAttribute("viewBox", `${x - 4} ${y - 4} ${w + 8} ${h + 8}`);
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", region.d);
      svg.append(path);
      el.append(svg);
    }
    if (piece.clue !== "shape") {
      const name = doc.createElement("span");
      name.textContent = region.name;
      el.append(name);
    }
    // Keep the piece inside the stage: 20%..80% of the width.
    pieceX = 0.2 + rng() * 0.6;
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

  function floatText(region, text, cls) {
    const p = stagePoint(region);
    const el = doc.createElement("div");
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.addEventListener("animationend", () => el.remove());
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
    if (!pack || pack.id !== packId) pack = await loadJson(`packs/${packId}.json`);
    drawMap();
    game = createGame(pack.regions.map((r) => r.id), rng);
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
        banner(`Nivel ${e.level}`, CLUE_HINT[levelRules(e.level).clue]);
      } else if (e.type === "spawn") {
        drawPiece(e);
      } else if (e.type === "correct") {
        regionEl(e.id).classList.add("placed");
        labelEl(e.id).classList.add("shown");
        zapPiece(region);
        floatText(region, `+${fmt(e.points)}${e.mult > 1 ? ` ×${e.mult}` : ""}`, "good");
      } else if (e.type === "wrong") {
        const el = regionEl(e.id);
        el.classList.remove("wrong");
        void el.getBoundingClientRect(); // restart the animation on a repeated wrong tap
        el.classList.add("wrong");
      } else if (e.type === "miss") {
        $("piece").classList.add("lost");
        regionEl(e.id).classList.add("reveal");
        labelEl(e.id).classList.add("shown");
        floatText(region, "Era aquí", "bad");
      } else if (e.type === "levelclear") {
        banner("Nivel superado", `+${fmt(e.bonus)}${e.lifeBack ? " · +1 vida" : ""}`, 1700);
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
    if (!game || paused) return;
    handle(game.answer(id));
  }

  function finish() {
    stopLoop();
    const s = game.state;
    const result = { score: s.score, level: s.level, bestStreak: s.bestStreak, correct: s.correct };
    const before = saved.best[pack.id];
    const record = !before || result.score > before.score;
    if (record) {
      saved.best[pack.id] = { score: result.score, level: result.level };
      store.save(saved);
    }
    $("over-pack").textContent = `${pack.flag} ${pack.title} · ${pack.subtitle}`;
    $("over-title").textContent = record && result.score > 0 ? "¡Nuevo récord!" : "Fin del juego";
    $("over-score").textContent = fmt(result.score);
    $("over-level").textContent = result.level;
    $("over-correct").textContent = result.correct;
    $("over-streak").textContent = result.bestStreak;
    $("share").textContent = "Compartir resultado";
    $("share").onclick = () => share(result);
    show("over");
  }

  async function share(result) {
    const url = doc.location.origin + doc.location.pathname;
    const text = shareText(pack, result, url);
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

  $("map").addEventListener("pointerdown", (ev) => {
    const id = ev.target.closest?.("path[data-id]")?.dataset.id;
    if (id) tap(id);
  });
  $("pause").addEventListener("click", () => setPaused(true));
  $("resume").addEventListener("click", () => setPaused(false));
  $("quit").addEventListener("click", () => showHome());
  $("again").addEventListener("click", () => start(pack.id));
  $("home-btn").addEventListener("click", () => showHome());
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) setPaused(true); });
  doc.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" || ev.key === "p") setPaused(!paused);
  });

  return { showHome, start, step, tap, setPaused, stopLoop, get game() { return game; }, get pack() { return pack; } };
}
