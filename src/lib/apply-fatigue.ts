// Ajuste de la intensidad de la playlist según la fatiga del atleta (#8).
//
// Si el readiness del día está bajo (HRV caído, FC reposo alta), la sesión
// planificada como "alta" se suaviza: baja el targetEnergy y, si la fatiga es
// severa, se desciende un escalón de intensidad (alta→moderada, moderada→baja)
// con sus correspondientes searchTerms y BPM. Esto NO cambia el plan de
// entrenamiento —el atleta sigue haciendo lo que le tocaba—, solo reconoce que
// cuando vas fatigado, incluso una sesión dura se hace a ritmo más conservador,
// y la música puede acompañar eso en vez de empujar al límite.
//
// Depende de `getReadinessScore` (creado por Claude en src/lib/readiness.ts).
// Si ese módulo aún no existe, o lanza, o no hay datos suficientes, no se aplica
// ningún ajuste: la intensidad original se devuelve intacta (fallback gracioso).

import type { IntensityLevel, SessionIntensity } from "./spotify-intensity";

// Tipo espejo del ReadinessResult de readiness.ts. Se importa como any para no
// acoplarnos al archivo que puede no existir todavía: solo nos importa `.score`.
type ReadinessLike = { score: number; label?: string; color?: string } | null;

/** Intenta cargar readiness.ts dinámicamente. Devuelve null si no está disponible. */
async function tryReadiness(garmin: any): Promise<ReadinessLike> {
  try {
    const mod = await import("./readiness");
    const fn = (mod as any)?.getReadinessScore;
    if (typeof fn !== "function") return null;
    return fn(garmin) as ReadinessLike;
  } catch {
    // El módulo no existe todavía, o getReadinessScore lanzó. Sin ajuste.
    return null;
  }
}

/** Cuánto se reduce la energía por cada punto de fatiga (score < 70). */
const FATIGUE_ENERGY_FACTOR = 0.004; // score 40 → -0.12; score 0 → -0.28

/** Mapea un nivel al inmediatamente inferior. */
const stepDown: Record<IntensityLevel, IntensityLevel> = {
  alta: "moderada",
  moderada: "baja",
  baja: "baja", // no baja más allá de "baja"
};

// BPM y energía por nivel, espejo de spotify-intensity.ts (importado aquí para
// no duplicar la tabla: se importa y se reexporta el perfil bajo).
const LEVEL_ENERGY: Record<IntensityLevel, number> = {
  baja: 0.25,
  moderada: 0.6,
  alta: 0.9,
};
const LEVEL_BPM: Record<IntensityLevel, [number, number]> = {
  baja: [70, 110],
  moderada: [135, 155],
  alta: [155, 180],
};
const LEVEL_LABEL: Record<IntensityLevel, string> = {
  baja: "Recuperación",
  moderada: "Ritmo sostenido",
  alta: "Alta intensidad",
};

/** Umbral por debajo del cual la fatiga es severa y se desciende de nivel. */
const SEVERE_FATIGUE_THRESHOLD = 40;

/**
 * Versión síncrona del ajuste, cuando ya se dispone del score. Útil para tests
 * y para llamadas que ya resolvieron el readiness antes.
 */
export function applyFatigueWithScore(
  intensity: SessionIntensity,
  score: number | null,
): SessionIntensity {
  // Sin score, o score sano: no hay nada que ajustar.
  if (score == null || score >= 70) return intensity;

  const energyDrop = (70 - score) * FATIGUE_ENERGY_FACTOR;
  const newEnergy = Math.max(0.15, intensity.targetEnergy - energyDrop);

  // Fatiga severa: descendemos un escalón de intensidad.
  if (score < SEVERE_FATIGUE_THRESHOLD && intensity.level !== "baja") {
    const newLevel = stepDown[intensity.level];
    return {
      ...intensity,
      level: newLevel,
      label: `${LEVEL_LABEL[newLevel]} · ajustada por fatiga`,
      targetEnergy: Math.min(newEnergy, LEVEL_ENERGY[newLevel]),
      targetTempoBpm: LEVEL_BPM[newLevel],
    };
  }

  // Fatiga moderada (40-70): solo bajamos la energía, sin cambiar de nivel.
  return {
    ...intensity,
    label: `${intensity.label} · suavizada por fatiga`,
    targetEnergy: newEnergy,
  };
}

/**
 * Punto de entrada. Aplica el ajuste por fatiga a una intensidad derivada.
 * Resuelve el readiness de forma asíncrona (importando readiness.ts) y luego
 * aplica el ajuste. Si no hay datos de readiness, devuelve la intensidad tal cual.
 *
 * `garmin` es el objeto crudo de GET /garmin (con health.hrv, health.resting_hr).
 */
export async function applyFatigue(
  intensity: SessionIntensity,
  garmin?: any,
): Promise<SessionIntensity> {
  if (!garmin) return intensity;
  const readiness = await tryReadiness(garmin);
  return applyFatigueWithScore(intensity, readiness?.score ?? null);
}