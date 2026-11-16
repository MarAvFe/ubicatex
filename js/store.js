// One small storage interface, so the self-test can swap in memory.
export function browserStore(key) {
  return {
    load() { try { return JSON.parse(localStorage.getItem(key)) ?? null; } catch { return null; } },
    save(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: play without saving */ } },
  };
}
export function memoryStore() {
  let data = null;
  return { load: () => data, save: (v) => { data = structuredClone(v); } };
}
