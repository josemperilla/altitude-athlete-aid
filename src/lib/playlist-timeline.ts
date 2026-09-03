// Sincronización playlist ↔ fases del entrenamiento.
//
// Spotify reproduce las canciones de una playlist de forma secuencial: no se
// puede arrancar una pista en un minuto arbitrario. La "sincronización" con las
// fases (calentamiento → intervalos → enfriamiento) se logra eligiendo canciones
// cuyas duraciones reales llenen cada fase: la primera canción fuerte arranca
// en el minuto en que empieza el bloque de series, con un error acotado por
// frontera y anclado a tiempos absolutos para que no se acumule entre fases.

import type { IntensityLevel, SessionPhase } from "@/lib/spotify-intensity";

export type TimelineTrack = { uri: string; popularity: number; durationMs: number };

export type PhaseWindow = {
  label: string;
  energy: number;
  band: IntensityLevel;
  /** Arranque objetivo, en ms desde el inicio de la playlist. */
  startMs: number;
  endMs: number;
};

export type Segment = {
  label: string;
  band: IntensityLevel;
  /** Segundo (real, tras el llenado de las fases previas) en que arranca el bloque. */
  startSec: number;
  /** Segundos de música colocados en el bloque. */
  filledSec: number;
  /** filledSec − duración objetivo de la fase. */
  errorSec: number;
  uris: string[];
};

/** Tolerancia por frontera de fase: con |error| menor, la fase se da por llena. */
export const TOLERANCE_MS = 45_000;
/** Tope de overshoot al cerrar una fase con la canción de mejor ajuste. */
const MAX_OVERSHOOT_MS = 90_000;
/** Duración asumida cuando una pista no trae duration_ms (3.5 min, como antes). */
export const DEFAULT_TRACK_MS = 210_000;
/** Fases de menos de 2 min se consolidan con la vecina de igual banda. */
const MIN_PHASE_MINUTES = 2;
/** Duración media de una canción, para ubicar los acentos personales. */
const AVG_TRACK_MS = 210_000;

const BAND_ORDER: IntensityLevel[] = ["baja", "moderada", "alta"];

/** Banda de energía (búsqueda) a la que pertenece una fase. */
export function bandFromEnergy(energy: number): IntensityLevel {
  if (energy < 0.45) return "baja";
  if (energy < 0.7) return "moderada";
  return "alta";
}

const labelBase = (l: string) => l.replace(/\s+\d+$/, "");

/**
 * Etiqueta al fusionar dos fases: si son la misma clase numerada ("Intervalo 1"
 * + "Intervalo 2") se pluraliza; si no, gana la etiqueta de la fase más larga.
 */
function mergeLabels(a: string, b: string, minutesA: number, minutesB: number): string {
  if (labelBase(a) === labelBase(b)) {
    const base = labelBase(a);
    return a === b ? a : base === "Intervalo" ? "Intervalos" : base;
  }
  return minutesA >= minutesB ? a : b;
}

/**
 * Fusiona fases consecutivas de la misma banda cuando alguna es demasiado
 * corta para contener su propia canción (< 2 min). Las micro-fases de distinta
 * banda se quedan: el llenado las atraviesa (0–1 canciones) y las fronteras se
 * autocorrigen con el anclaje absoluto.
 */
function consolidatePhases(phases: SessionPhase[]): SessionPhase[] {
  let current = phases;
  // Repetir hasta estabilizar: las fusiones pueden volver adyacentes fases
  // que antes no lo eran (cadenas de series cortas).
  for (let pass = 0; pass < phases.length; pass++) {
    const out: SessionPhase[] = [];
    let merged = false;
    for (const p of current) {
      const last = out[out.length - 1];
      const sameBand = last && bandFromEnergy(last.energy) === bandFromEnergy(p.energy);
      const tiny = (last?.minutes ?? Infinity) < MIN_PHASE_MINUTES || p.minutes < MIN_PHASE_MINUTES;
      if (last && sameBand && tiny) {
        merged = true;
        const minutes = last.minutes + p.minutes;
        out[out.length - 1] = {
          energy: (last.energy * last.minutes + p.energy * p.minutes) / minutes,
          minutes,
          seconds: (last.seconds ?? last.minutes * 60) + (p.seconds ?? p.minutes * 60),
          label: mergeLabels(last.label, p.label, last.minutes, p.minutes),
        };
      } else {
        out.push({ ...p });
      }
    }
    if (!merged) return out;
    current = out;
    if (current.length <= 1) return current;
  }
  return current;
}

/**
 * Ventanas de la sesión con arranques absolutos: la fase n arranca donde
 * termina la n−1 según el plan (no según lo que llenó la playlist).
 */
export function buildTimeline(phases: SessionPhase[]): PhaseWindow[] {
  const out: PhaseWindow[] = [];
  let cursor = 0;
  for (const p of consolidatePhases(phases)) {
    const ms = (p.seconds ?? p.minutes * 60) * 1000;
    out.push({
      label: p.label,
      energy: p.energy,
      band: bandFromEnergy(p.energy),
      startMs: cursor,
      endMs: cursor + ms,
    });
    cursor += ms;
  }
  return out;
}

export type BandPools = Record<IntensityLevel, TimelineTrack[]>;

/**
 * Orden de preferencia al pedir prestado: la banda de la fase, sus adyacentes
 * y por último el resto — mejor una canción del mood vecino que un hueco.
 */
function bandPreference(band: IntensityLevel): IntensityLevel[] {
  const i = BAND_ORDER.indexOf(band);
  return [band, ...BAND_ORDER.slice(0, i), ...BAND_ORDER.slice(i + 1)];
}

/**
 * Llena cada fase con canciones hasta cubrir su ventana (± TOLERANCE_MS),
 * recorriéndolas en orden con un cursor real de reproducción:
 *
 *  1. `remaining = endMs − cursor` es un anclaje absoluto: el error de la fase
 *     anterior no se hereda — cada fase vuelve a apuntar a su minuto del plan.
 *  2. Se toma la primera pista preferida que quepa sin pasarse de la
 *     tolerancia; cuando ninguna cabe, la de menor overshoot si no supera
 *     MAX_OVERSHOOT_MS; si no, la fase queda corta (la siguiente empieza
 *     contra su tiempo absoluto, nunca acumulando retraso).
 *  3. Los acentos personales se intercalan a mitad de fase, repartidos de
 *     forma proporcional al largo de la sesión, y su duración cuenta.
 *
 * Dentro de cada banda el orden preferido sigue la filosofía de los dos
 * punteros originales: bandas fuertes consumen primero las más populares,
 * la banda suave las menos populares.
 */
export function fillTimeline(
  pools: BandPools,
  personal: TimelineTrack[],
  phases: SessionPhase[],
): { segments: Segment[]; uris: string[] } {
  const windows = buildTimeline(phases);
  // Pistas sin duración útil (0/negativa) se asumen de duración media: además
  // de darles un valor razonable, evita un bucle infinito en el llenado.
  const normalize = (t: TimelineTrack): TimelineTrack => ({
    ...t,
    durationMs: Number.isFinite(t.durationMs) && t.durationMs > 0 ? t.durationMs : DEFAULT_TRACK_MS,
  });
  const sorted: BandPools = {
    baja: pools.baja.map(normalize).sort((a, b) => a.popularity - b.popularity),
    moderada: pools.moderada.map(normalize).sort((a, b) => b.popularity - a.popularity),
    alta: pools.alta.map(normalize).sort((a, b) => b.popularity - a.popularity),
  };
  const personalQueue = personal.map(normalize);
  const used = new Set<string>();

  const pickTrack = (band: IntensityLevel, remaining: number): TimelineTrack | null => {
    for (const b of bandPreference(band)) {
      const free = sorted[b].filter((t) => !used.has(t.uri));
      if (free.length === 0) continue;
      const fit = free.find((t) => t.durationMs <= remaining + TOLERANCE_MS);
      if (fit) return fit;
      const closest = free.reduce((best, t) => (t.durationMs < best.durationMs ? t : best));
      if (closest.durationMs - remaining <= MAX_OVERSHOOT_MS) return closest;
      // El overshoot mínimo de esta banda es demasiado grande: probar la siguiente.
    }
    return null;
  };

  const segments: Segment[] = [];
  let accentUsed = 0;
  let cursor = 0;

  windows.forEach((w, windowIdx) => {
    const segStart = cursor;
    const targetMs = w.endMs - w.startMs;
    const tracks: TimelineTrack[] = [];
    // Cadencia proporcional de acentos: llevarlos a ritmo de progreso de la
    // sesión, sin amontonarlos al principio.
    const progress = windows.length <= 1 ? 1 : windowIdx / (windows.length - 1);
    const accentDue =
      personalQueue.length > 0 &&
      accentUsed / Math.max(1, personal.length) <= progress &&
      targetMs >= 2 * AVG_TRACK_MS;
    const accentAt = accentDue ? Math.max(1, Math.round(targetMs / AVG_TRACK_MS / 2)) : -1;

    while (w.endMs - cursor > TOLERANCE_MS) {
      if (tracks.length === accentAt) {
        const accent = personalQueue.shift()!;
        tracks.push(accent);
        used.add(accent.uri);
        accentUsed++;
        cursor += accent.durationMs;
        continue;
      }
      const track = pickTrack(w.band, w.endMs - cursor);
      if (!track) break; // pools agotados: fase corta, sin acumular retraso.
      tracks.push(track);
      used.add(track.uri);
      cursor += track.durationMs;
    }

    segments.push({
      label: w.label,
      band: w.band,
      startSec: Math.round(segStart / 1000),
      filledSec: Math.round((cursor - segStart) / 1000),
      errorSec: Math.round((cursor - segStart - targetMs) / 1000),
      uris: tracks.map((t) => t.uri),
    });
  });

  return { segments, uris: segments.flatMap((s) => s.uris) };
}
