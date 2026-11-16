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
  // Pauses give the player time to see what happened before the next piece.
  pauseAfterCorrectMs: 550,
  pauseAfterMissMs: 1600, // longer: the right answer is being shown
  pauseAfterLevelMs: 1800,
};

// A level is one pass through every region. Early levels teach (name and shape
// together, slow); later ones take a clue away, then speed up.
export function levelRules(level) {
  if (level === 1) return { fallMs: 9000, clue: "both" };
  if (level === 2) return { fallMs: 7500, clue: "name" };
  if (level === 3) return { fallMs: 7500, clue: "shape" };
  // Floor of 2.5 s: below that a phone player cannot read and reach in time.
  return { fallMs: Math.max(2500, 7000 - (level - 4) * 600), clue: "mix" };
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

// Small seeded generator so a game can be replayed exactly (tests now, daily
// challenges later).
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(regionIds, rng = Math.random) {
  const s = {
    phase: "pause", // "falling" | "pause" | "over"
    pauseMs: 0,
    level: 0,
    lives: RULES.lives,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    queue: [],
    current: null, // { id, clue, fallMs, elapsed, wrongTries }
    placed: [],
    levelClean: true,
  };

  function startLevel(events) {
    s.level += 1;
    s.queue = shuffle(regionIds, rng);
    s.placed = [];
    s.levelClean = true;
    events.push({ type: "level", level: s.level });
  }

  function spawn(events) {
    if (s.queue.length === 0) startLevel(events);
    const rules = levelRules(s.level);
    const clue = rules.clue === "mix" ? (rng() < 0.5 ? "name" : "shape") : rules.clue;
    s.current = { id: s.queue.shift(), clue, fallMs: rules.fallMs, elapsed: 0, wrongTries: 0 };
    s.phase = "falling";
    events.push({ type: "spawn", ...s.current });
  }

  function afterPiece(events, pauseMs) {
    s.current = null;
    s.phase = "pause";
    s.pauseMs = pauseMs;
    if (s.lives <= 0) {
      s.phase = "over";
      events.push({ type: "over" });
    } else if (s.queue.length === 0) {
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
      s.lives -= 1;
      s.streak = 0;
      s.levelClean = false;
      events.push({ type: "miss", id });
      afterPiece(events, RULES.pauseAfterMissMs);
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
    events.push({ type: "correct", id, points, mult });
    afterPiece(events, RULES.pauseAfterCorrectMs);
    return events;
  }

  return { state: s, tick, answer };
}

// Text a player can paste into a chat. One line of result, one line of link.
export function shareText(pack, result, url) {
  const n = (v) => v.toLocaleString("es-CR");
  return `Mapazo ${pack.flag} ${pack.title} · ${pack.subtitle}\n` +
    `${n(result.score)} puntos · nivel ${result.level} · racha de ${result.bestStreak}\n${url}`;
}
