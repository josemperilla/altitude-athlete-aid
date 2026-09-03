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

/**
 * Ritmo medio del deporte para estimar pasos por distancia sin target legible.
 * (6 min/km corriendo, 2.4 min/km en bici — mismos supuestos que MIN_PER_KM.)
 */
const AVG_SPEED: Record<"running" | "cycling", number> = {
  running: 1000 / 360,
  cycling: 1000 / 144,
};

/**
 * Segundos reales de un paso, resolviendo la unidad de `endConditionValue`:
 * tiempo → segundos tal cual; distancia → metros ÷ ritmo del target (pace/speed
 * vienen en m/s), con fallback al ritmo medio del deporte. `lap.button` y pasos
 * sin duración medible devuelven 0. `stepSeconds` se queda para el render, donde
 * el valor crudo se muestra con su unidad (`stepMeasure`); este es el que hay
 * que usar para sumar duraciones.
 */
export function resolveStepSeconds(step: Step, sport: "running" | "cycling"): number {
  const value = Number(step?.endConditionValue);
  if (!Number.isFinite(value) || value <= 0 || value >= 1_000_000) return 0;

  const raw = step?.endCondition;
  const key = String(
    typeof raw === "string" ? raw : ((raw as any)?.conditionTypeKey ?? ""),
  ).toLowerCase();
  if (!key.includes("distance")) {
    // Tiempo, lap.button o condición ausente: el valor ya son segundos.
    return key.includes("lap") || key.includes("iteration") ? 0 : value;
  }

  // Distancia: a qué velocidad, según el target del paso.
  const targetKey = String(step?.targetType?.workoutTargetTypeKey ?? "").toLowerCase();
  const lo = Number(step?.targetValueOne);
  const hi = Number(step?.targetValueTwo);
  const speeds = [lo, hi].filter((v) => Number.isFinite(v) && v > 0 && v < 30);
  const speed =
    targetKey.includes("pace") || targetKey.includes("speed")
      ? speeds.reduce((a, v) => a + v, 0) / Math.max(1, speeds.length) || AVG_SPEED[sport]
      : AVG_SPEED[sport];
  return value / speed;
}

/** Tope de seguridad para expandir grupos de repetición corruptos. */
const MAX_ITERATIONS = 50;

/**
 * Aplana los grupos de repetición multiplicando sus hijos por
 * `numberOfIterations`, para que series como "8×(2 min fuerte / 1 min suave)"
 * aporten sus 24 minutos a las duraciones en vez de desaparecer (el paso
 * `repeat` en sí no trae duración). Los hijos pueden anidar otros grupos.
 */
export function expandSteps(steps: Step[], depth = 0): Step[] {
  const out: Step[] = [];
  for (const step of steps ?? []) {
    const children = Array.isArray(step?.workoutSteps) ? step.workoutSteps : [];
    const isRepeat = stepTypeKey(step) === "repeat" || /repeat/.test(stepTypeKey(step));
    if (!isRepeat || children.length === 0 || depth >= 3) {
      out.push(step);
      continue;
    }
    const iters = Number(step?.numberOfIterations);
    const n = Number.isFinite(iters) ? Math.min(Math.max(1, Math.round(iters)), MAX_ITERATIONS) : 1;
    for (let i = 0; i < n; i++) out.push(...expandSteps(children, depth + 1));
  }
  return out;
}

// Redondea una sola vez y deriva minutos y segundos del mismo total: redondear
// por separado (floor en minutos, round en segundos) desalinea los dos cuando
// s%60 cae en [59.5, 60) — p. ej. 179.6s daba "2:00" en vez de "3:00".
export const mmss = (s: number) => {
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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
