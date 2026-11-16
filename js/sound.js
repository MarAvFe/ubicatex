// All sound is synthesised with Web Audio: no audio files to load or license.
// Browsers only allow sound after a user gesture, so nothing starts before unlock().

// C major pentatonic: any order of these notes sounds pleasant.
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
// The menu tune: scale steps, one per beat; null is a rest.
const TUNE = [0, 2, 4, 2, 5, 4, 2, null, 1, 3, 5, 3, 6, 5, 3, null];
const BEAT_MS = 320;

export function createSound(isMuted) {
  let ctx = null;
  let musicTimer = 0;
  let step = 0;
  let wantMusic = false;

  function unlock() {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") ctx.resume();
    if (wantMusic) music(true);
  }

  function note(freq, { at = 0, dur = 0.12, type = "triangle", gain = 0.12, slideTo = null } = {}) {
    if (!ctx || isMuted()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    // Short fade in and out: an abrupt start or stop clicks.
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function music(on) {
    wantMusic = on;
    clearInterval(musicTimer);
    musicTimer = 0;
    if (!on || !ctx) return;
    musicTimer = setInterval(() => {
      const n = TUNE[step++ % TUNE.length];
      // Quiet on purpose: it is background for a menu, not a soundtrack.
      if (n !== null) note(SCALE[n], { dur: 0.5, type: "sine", gain: 0.035 });
      if (step % 8 === 1) note(SCALE[0] / 2, { dur: 1.2, type: "sine", gain: 0.03 });
    }, BEAT_MS);
  }

  return {
    unlock,
    music,
    tap: () => note(880, { dur: 0.04, type: "square", gain: 0.03 }),
    // The chime climbs with the multiplier, so a streak can be heard building.
    good: (mult = 1) => { const i = Math.min(mult - 1, 4); note(SCALE[i + 2], { dur: 0.1 }); note(SCALE[i + 4], { at: 0.08, dur: 0.16 }); },
    bad: () => note(150, { dur: 0.18, type: "sawtooth", gain: 0.06 }),
    miss: () => note(330, { dur: 0.4, slideTo: 110, gain: 0.1 }),
    levelUp: () => [0, 2, 4, 7].forEach((n, i) => note(SCALE[n], { at: i * 0.09, dur: 0.18 })),
    over: () => [4, 2, 0].forEach((n, i) => note(SCALE[n] / 2, { at: i * 0.18, dur: 0.3 })),
    record: () => [0, 2, 4, 5, 7].forEach((n, i) => note(SCALE[n], { at: i * 0.08, dur: 0.2, type: "square", gain: 0.05 })),
  };
}

// For the self-test and for browsers without Web Audio.
export function silentSound() {
  const noop = () => {};
  return { unlock: noop, music: noop, tap: noop, good: noop, bad: noop, miss: noop, levelUp: noop, over: noop, record: noop };
}
