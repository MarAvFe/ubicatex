// Game rules. No DOM, no storage, no clock: the caller feeds time in with tick(),
// so the self-test can play whole games instantly and deterministically.

export const RULES = {
  lives: 3,
  basePoints: 100,
  // Up to this much extra for answering while the piece is still high.
  speedBonus: 100,
  // The multiplier grows by 1 every `streakStep` first-try answers, up to `maxMultiplier`.
  streakStep: 3,
  maxMultiplier: 5,
  levelBonus: 200,
  // A missed piece shows where it belonged only in the first levels. After that the
  // region stays empty and the piece comes back later: mistakes teach, they don't solve.
  revealThroughLevel: 2,
  // Pauses give the player time to see what happened before the next piece.
  pauseAfterCorrectMs: 550,
  pauseAfterMissMs: 1600, // longer: the right answer is being shown
  pauseAfterLevelMs: 1800,
  // Daily challenge: the same short game for everyone on a given day.
  dailyPieces: 10,
  dailyFallMs: 6000,
  topScores: 10,
};

// A level is one pass through every region. Early levels teach (name and shape
// together, slow); then one clue at a time; then everything mixed and faster.
export function levelRules(level, hasCapitals = false) {
  const teaching = hasCapitals ? ["both", "name", "shape", "capital"] : ["both", "name", "shape"];
  if (level <= teaching.length) return { fallMs: level === 1 ? 9000 : 7500, clue: teaching[level - 1] };
  // Floor of 2.5 s: below that a phone player cannot read and reach in time.
  return { fallMs: Math.max(2500, 7000 - (level - teaching.length - 1) * 600), clue: "mix" };
}

export function mixClues(hasCapitals) {
  return hasCapitals ? ["name", "shape", "capital"] : ["name", "shape"];
}

export function multiplier(streak) {
  return Math.min(RULES.maxMultiplier, 1 + Math.floor(streak / RULES.streakStep));
}

export function shuffle(items, rng) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Small seeded generator so a game can be replayed exactly (tests, daily challenge).
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: turns "pack:date" into the day's seed.
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function dailySeed(packId, date) { return hashString(`${packId}:${date}`); }

// Local calendar day, so the challenge changes at the player's midnight.
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// opts: { hasCapitals, daily }
export function createGame(regionIds, rng = Math.random, opts = {}) {
  const hasCapitals = !!opts.hasCapitals;
  const daily = !!opts.daily;
  const s = {
    daily,
    phase: "pause", // "falling" | "pause" | "over"
    pauseMs: 0,
    level: 0,
    lives: RULES.lives,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    total: daily ? RULES.dailyPieces : null,
    queue: [],
    current: null, // { id, clue, fallMs, elapsed, wrongTries }
    placed: [],
    marks: [], // per finished piece: "g" first try, "y" after a wrong tap, "r" landed
    levelClean: true,
    done: false,
  };

  function startLevel(events) {
    s.level += 1;
    s.placed = [];
    s.levelClean = true;
    if (daily) {
      // Small maps repeat regions to fill the ten pieces; never the same one twice in a row.
      while (s.queue.length < RULES.dailyPieces) {
        const more = shuffle(regionIds, rng);
        if (more[0] === s.queue.at(-1) && more.length > 1) more.push(more.shift());
        s.queue.push(...more);
      }
      s.queue.length = RULES.dailyPieces;
    } else {
      s.queue = shuffle(regionIds, rng);
    }
    events.push({ type: "level", level: s.level });
  }

  function spawn(events) {
    if (s.queue.length === 0) startLevel(events);
    const rules = daily ? { fallMs: RULES.dailyFallMs, clue: "mix" } : levelRules(s.level, hasCapitals);
    const choices = mixClues(hasCapitals);
    const clue = rules.clue === "mix" ? choices[Math.floor(rng() * choices.length)] : rules.clue;
    s.current = { id: s.queue.shift(), clue, fallMs: rules.fallMs, elapsed: 0, wrongTries: 0 };
    s.phase = "falling";
    events.push({ type: "spawn", ...s.current });
  }

  function afterPiece(events, pauseMs) {
    s.current = null;
    s.phase = "pause";
    s.pauseMs = pauseMs;
    if ((!daily && s.lives <= 0) || (daily && s.queue.length === 0)) {
      s.phase = "over";
      events.push({ type: "over" });
    } else if (!daily && s.queue.length === 0) {
      const bonus = RULES.levelBonus * s.level;
      s.score += bonus;
      const lifeBack = s.levelClean && s.lives < RULES.lives;
      if (lifeBack) s.lives += 1;
      s.pauseMs += RULES.pauseAfterLevelMs;
      events.push({ type: "levelclear", level: s.level, bonus, lifeBack });
    }
  }

  function tick(dtMs) {
    const events = [];
    if (s.phase === "over") return events;
    if (s.phase === "pause") {
      s.pauseMs -= dtMs;
      if (s.pauseMs <= 0) spawn(events);
      return events;
    }
    s.current.elapsed += dtMs;
    if (s.current.elapsed >= s.current.fallMs) {
      const id = s.current.id;
      s.streak = 0;
      s.levelClean = false;
      s.marks.push("r");
      // The daily challenge has no lives (everyone plays all ten) and always shows the answer.
      const reveal = daily || s.level <= RULES.revealThroughLevel;
      if (!daily) s.lives -= 1;
      // Not revealed: the piece goes to the back of the line and falls again.
      if (!reveal && s.lives > 0) s.queue.push(id);
      events.push({ type: "miss", id, reveal });
      afterPiece(events, reveal ? RULES.pauseAfterMissMs : RULES.pauseAfterCorrectMs);
    }
    return events;
  }

  function answer(id) {
    const events = [];
    if (s.phase !== "falling") return events;
    const piece = s.current;
    if (id !== piece.id) {
      piece.wrongTries += 1;
      s.streak = 0;
      s.levelClean = false;
      events.push({ type: "wrong", id });
      return events;
    }
    const left = 1 - piece.elapsed / piece.fallMs;
    let points = RULES.basePoints + Math.round(RULES.speedBonus * left);
    // Only a first-try answer feeds the streak; a corrected one is worth half.
    if (piece.wrongTries === 0) s.streak += 1;
    else points = Math.round(points / 2);
    const mult = multiplier(s.streak);
    points *= mult;
    s.score += points;
    s.correct += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.placed.push(id);
    s.marks.push(piece.wrongTries === 0 ? "g" : "y");
    events.push({ type: "correct", id, points, mult });
    afterPiece(events, RULES.pauseAfterCorrectMs);
    return events;
  }

  return { state: s, tick, answer };
}

// ---- Top scores (arcade table, kept on the device) ----

// Three characters, upper case, letters and digits only; "AAA" when nothing usable is typed.
export function cleanInitials(text) {
  const s = (text ?? "").normalize("NFD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return s ? s.padEnd(3, "A") : "AAA";
}

// Position (0-based) a score would take in the table, or -1 if it does not make it.
export function rankFor(table, score) {
  if (score <= 0) return -1;
  const at = table.findIndex((row) => score > row.score);
  const rank = at === -1 ? table.length : at;
  return rank < RULES.topScores ? rank : -1;
}

export function addScore(table, entry) {
  const rank = rankFor(table, entry.score);
  if (rank === -1) return { table, rank };
  const next = table.slice();
  next.splice(rank, 0, entry);
  return { table: next.slice(0, RULES.topScores), rank };
}

// ---- Sharing ----

const MARK = { g: "🟩", y: "🟨", r: "🟥" };
const num = (v) => v.toLocaleString("es-CR");

// Text a player can paste into a chat. `url` is left out when empty.
export function shareText(pack, result, url = "") {
  const head = `Mapazo ${pack.flag} ${pack.title} · ${pack.subtitle}`;
  const lines = result.daily
    ? [`${head} — reto del ${result.date}`, result.marks.map((m) => MARK[m]).join(""), `${num(result.score)} puntos`]
    : [head, `${num(result.score)} puntos · nivel ${result.level} · racha de ${result.bestStreak}`];
  if (url) lines.push(url);
  return lines.join("\n");
}
