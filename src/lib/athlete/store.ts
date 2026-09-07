// Perfil activo: "quién está usando el teléfono ahora mismo", no un login.
// Mismo patrón que src/lib/spotify/store.ts — localStorage + pub/sub — porque
// el problema es idéntico: un valor que vive en el navegador y que React
// necesita saber cuándo cambió.

export type AthleteId = "jose" | "andrea";

const KEY = "athlete_profile";
const listeners = new Set<() => void>();

export function getActiveAthlete(): AthleteId {
  try {
    return localStorage.getItem(KEY) === "andrea" ? "andrea" : "jose";
  } catch {
    return "jose";
  }
}

export function setActiveAthlete(id: AthleteId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage lleno o bloqueado: el toggle no persiste, pero no revienta.
  }
  for (const l of listeners) l();
}

export function subscribeAthlete(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
