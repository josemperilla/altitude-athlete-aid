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
// Las tablas de energía/BPM/etiquetas vienen de spotify-intensity.ts para no
// duplicarlas. Si no hay datos suficientes de readiness, no se aplica ningún
// ajuste: la intensidad original se devuelve intacta (fallback gracioso).

import {
  BPM,
  ENERGY,
  LABEL,
  type IntensityLevel,
  type SessionIntensity,
} from "./spotify-intensity";
import { getReadinessScore } from "./readiness";

/** Cuánto se reduce la energía por cada punto de fatiga (score < 70). */
const FATIGUE_ENERGY_FACTOR = 0.004; // score 40 → -0.12; score 0 → -0.28

/** Mapea un nivel al inmediatamente inferior. */
const stepDown: Record<IntensityLevel, IntensityLevel> = {
  alta: "moderada",
  moderada: "baja",
  baja: "baja", // no baja más allá de "baja"
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
      label: `${LABEL[newLevel]} · ajustada por fatiga`,
      targetEnergy: Math.min(newEnergy, ENERGY[newLevel]),
      targetTempoBpm: BPM[newLevel],
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
 * Si no hay datos de readiness, devuelve la intensidad tal cual.
 *
 * `garmin` es el objeto crudo de GET /garmin (con health.hrv, health.resting_hr).
 */
export async function applyFatigue(
  intensity: SessionIntensity,
  garmin?: any,
): Promise<SessionIntensity> {
  if (!garmin) return intensity;
  const readiness = getReadinessScore(garmin);
  return applyFatigueWithScore(intensity, readiness?.score ?? null);
}
