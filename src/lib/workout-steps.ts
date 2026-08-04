// Lectura de los workouts de Garmin: helpers compartidos por la clasificación
// de intensidad (spotify-intensity.ts) y por el modal de detalle de sesión
// (SessionDetailModal.tsx). Antes estaban duplicados en ambos archivos.

export type Step = {
  stepType?: unknown;
  description?: string;
  endConditionValue?: number;
  endCondition?: unknown;
  numberOfIterations?: number;
  targetType?: { workoutTargetTypeKey?: string };
  targetValueOne?: number;
  targetValueTwo?: number;
  workoutSteps?: Step[];
};

/** Pasos aplanados del workout (segments → steps), ignorando el anidado. */
export function extractSteps(session: any): Step[] {
  const segments = session?.garmin_workout?.workoutSegments;
  if (!Array.isArray(segments)) return [];
  return segments.flatMap((seg: any) => (Array.isArray(seg?.workoutSteps) ? seg.workoutSteps : []));
}

export function stepTypeKey(step: Step): string {
  const t = step?.stepType as any;
  return String(typeof t === "string" ? t : (t?.stepTypeKey ?? "")).toLowerCase();
}

const STEP_LABELS: [RegExp, string][] = [
  [/warmup/, "Calentamiento"],
  [/cooldown/, "Enfriamiento"],
  [/recovery/, "Recuperación"],
  [/rest/, "Descanso"],
  [/interval/, "Intervalo"],
  [/repeat/, "Repeticiones"],
];

/** Etiqueta legible del tipo de paso. */
export function stepLabel(step: Step): string {
  const key = stepTypeKey(step);
  for (const [pattern, label] of STEP_LABELS) {
    if (pattern.test(key)) return label;
  }
  return "Bloque principal";
}

/** Segundos de un paso (endConditionValue viene en segundos cuando es de tiempo). */
export function stepSeconds(step: Step): number {
  const v = Number(step?.endConditionValue);
  return Number.isFinite(v) && v > 0 && v < 1_000_000 ? v : 0;
}

export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

/**
 * Medida de un paso. `endConditionValue` son segundos cuando la condición es de
 * tiempo y metros cuando es de distancia; el tipo va en `endCondition`, que a
 * veces llega como string suelto.
 */
export function stepMeasure(step: Step): string | null {
  const value = Number(step?.endConditionValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  const raw = step?.endCondition;
  const key = String(
    typeof raw === "string" ? raw : ((raw as any)?.conditionTypeKey ?? ""),
  ).toLowerCase();
  if (key.includes("distance")) {
    return value >= 1000 ? `${Number((value / 1000).toFixed(2))} km` : `${Math.round(value)} m`;
  }
  // "lap.button" / "iterations" no describen una duración.
  if (key.includes("lap") || key.includes("iteration")) return null;
  return mmss(value);
}

/** Umbrales de FC en altitud (Bogotá, 2.600 m) para traducir pulsaciones a zona. */
export function zoneFromBpm(maxBpm: number): number {
  if (maxBpm > 165) return 5;
  if (maxBpm > 145) return 4;
  if (maxBpm > 125) return 3;
  return maxBpm > 110 ? 2 : 1;
}

/**
 * Zona máxima que exige un paso. La descripción va primero porque el backend escribe
 * la zona explícita ("FC: 100–125 bpm (Z1)"); inferirla de las pulsaciones es una
 * aproximación y ahí un rango Z1 de 100-125 se leería como Z2.
 */
export function stepMaxZone(step: Step): number | null {
  const desc = String(step?.description ?? "");
  const range = /z\s?([1-5])\s?[/-]\s?z?\s?([1-5])/i.exec(desc);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = /\bz\s?([1-5])\b/i.exec(desc);
  if (single) return Number(single[1]);

  // Sin zona escrita: `targetValueOne/Two` traen el rango de FC del paso.
  const isHeartRate = /heart\.?rate/i.test(String(step?.targetType?.workoutTargetTypeKey ?? ""));
  const hi = Number(step?.targetValueTwo);
  if (isHeartRate && Number.isFinite(hi) && hi > 0) return zoneFromBpm(hi);

  const bpm = /(\d{2,3})\s?[–-]\s?(\d{2,3})\s*bpm/i.exec(desc);
  return bpm ? zoneFromBpm(Number(bpm[2])) : null;
}
