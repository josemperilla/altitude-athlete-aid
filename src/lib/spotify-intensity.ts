import {
  extractSteps,
  mmss,
  stepMaxZone,
  stepSeconds,
  stepTypeKey,
  type Step,
} from "@/lib/workout-steps";

export type IntensityLevel = "baja" | "moderada" | "alta";
export type Sport = "running" | "cycling";

export type SessionIntensity = {
  level: IntensityLevel;
  sport: Sport;
  label: string;
  /** Spotify search-friendly genre/mood keywords, ordered by relevance. */
  searchTerms: string[];
  /** Target energy 0-1. */
  targetEnergy: number;
  /** Rango de BPM coherente con el esfuerzo. */
  targetTempoBpm: [number, number];
  /** Minutos estimados de la sesión — define cuántas canciones lleva la playlist. */
  estimatedMinutes: number;
  /** false cuando la intensidad se infirió y no venía declarada. */
  specified: boolean;
};

/** Ritmos promedio para estimar duración cuando la sesión solo trae distancia. */
const MIN_PER_KM: Record<Sport, number> = { running: 6, cycling: 2.4 };
const DEFAULT_MINUTES: Record<Sport, number> = { running: 60, cycling: 70 };

/**
 * El plan usa "running" / "cycling" en `sport`, y las sesiones de ciclismo generadas
 * localmente traen en cambio un `type` como "ciclorruta_en_plano".
 */
export function deriveSport(session: any): Sport {
  const raw = String(session?.sport ?? session?.type ?? "").toLowerCase();
  if (/cycl|bike|bici|ciclo|ciclorruta|rodillo/.test(raw)) return "cycling";
  if (/run|carrera|trote/.test(raw)) return "running";
  // Sin campo útil: el nombre suele delatar el deporte.
  const name = String(session?.name ?? "").toLowerCase();
  return /ciclorruta|bici|patios/.test(name) ? "cycling" : "running";
}

/** Zona declarada en `primary_zone`/`zone`, o embebida en el nombre ("… Z2"). */
function parseZone(session: any): number | null {
  const field = session?.primary_zone ?? session?.zone;
  if (field != null) {
    const m = /([1-5])/.exec(String(field));
    if (m) return Number(m[1]);
  }
  const m = /\bz\s?([1-5])\b/i.exec(String(session?.name ?? ""));
  return m ? Number(m[1]) : null;
}

// ── Estructura del workout de Garmin ────────────────────────────────────────
// Las sesiones de ciclismo traen `garmin_workout` con los pasos reales
// (calentamiento / parte principal / enfriamiento), cada uno con su rango de FC.
// Es la señal más fiable cuando no hay `primary_zone` declarada.

/**
 * Nivel según lo que exigen los pasos, ignorando calentamiento y enfriamiento:
 * lo que define la sesión es su parte principal.
 *
 * OJO con las sesiones de Runna: sus workouts apuntan a ritmo (pace/speed), no a
 * pulsaciones, así que `stepMaxZone` no puede leer zona y devuelve null para todos.
 * Antes esto hacía que cualquier paso `interval` (que Garmin le pone al bloque
 * principal de cualquier workout, incluido un rodaje suave) se clasificara como
 * "alta" — y los Easy Run sonaban igual que los Intervalos. Ahora, sin zonas
 * legibles, devolvemos null para caer al nombre (que acierta), con una sola
 * excepción: un grupo de repetición real (numberOfIterations > 1) sí es señal
 * fuerte de series → alta. Un rodaje continuo no tiene repeticiones.
 */
function levelFromSteps(steps: Step[]): IntensityLevel | null {
  if (steps.length === 0) return null;

  const body = steps.filter((s) => !/warmup|cooldown|rest|recovery/.test(stepTypeKey(s)));
  const zones = body.map(stepMaxZone).filter((z): z is number => z != null);

  if (zones.length > 0) {
    const max = Math.max(...zones);
    return max >= 4 ? "alta" : max >= 2 ? "moderada" : "baja";
  }

  // Sin zonas legibles: la única señal estructural fiable de calidad es un grupo
  // de repetición real (no el mero stepType "interval", que es genérico en Garmin).
  const hasRealRepeat = body.some((s) => {
    const key = stepTypeKey(s);
    if (key !== "repeat") return false;
    const iters = Number((s as any)?.numberOfIterations);
    return Number.isFinite(iters) && iters > 1;
  });
  if (hasRealRepeat) return "alta";

  // Si todos los pasos son warmup/cooldown/rest → baja. Si no hay señal clara,
  // null: se cae al texto del nombre, que hoy clasifica bien.
  return steps.every((s) => !stepTypeKey(s) || /warmup|cooldown|rest|recovery/.test(stepTypeKey(s)))
    ? "baja"
    : null;
}

/**
 * Une todo el texto disponible de la sesión. Las de ciclismo traen `rationale` y
 * descripciones por paso ("ritmo conversacional", "no superes 125 bpm"), que dicen
 * mucho más que el título.
 */
function sessionText(session: any): string {
  const parts = [String(session?.name ?? "")];
  if (session?.rationale) parts.push(String(session.rationale));
  if (session?.garmin_workout?.description) parts.push(String(session.garmin_workout.description));
  for (const step of extractSteps(session)) {
    if (step?.description) parts.push(String(step.description));
  }
  return parts.join(" \n ");
}

/**
 * Los nombres del plan mezclan inglés y español: "W7 Wed Tempo - Tempo 2km Repeats",
 * "Subida a Patios — Estímulo aeróbico Z2", "W7 Fri Intervals - Fast 8-4-2s".
 * Se evalúa de más específico a más genérico.
 */
function levelFromText(text: string): IntensityLevel | null {
  if (/interval|repeat|vo2|series|sprint|strides?|fartlek|hill|subida|cuestas|fast\b/i.test(text)) {
    return "alta";
  }
  // El largo manda sobre "race practice": son 90+ min aeróbicos con tramos a ritmo,
  // no una sesión de calidad de punta a punta.
  if (/long run|largo\b|salida larga|endurance|resistencia/i.test(text)) return "moderada";
  if (/tempo|threshold|umbral|progresivo|steady|race practice|marathon pace/i.test(text)) {
    return "alta";
  }
  if (/easy|recuperaci[oó]n|recovery|regenerativ|conversacional|suave|rodaje/i.test(text)) {
    return "baja";
  }
  if (/aer[oó]bico/i.test(text)) return "moderada";
  return null;
}

export const LABEL: Record<IntensityLevel, string> = {
  baja: "Recuperación",
  moderada: "Ritmo sostenido",
  alta: "Alta intensidad",
};

export const ENERGY: Record<IntensityLevel, number> = { baja: 0.25, moderada: 0.6, alta: 0.9 };

export const BPM: Record<IntensityLevel, [number, number]> = {
  baja: [70, 110],
  moderada: [135, 155],
  alta: [155, 180],
};

/** Términos de búsqueda para /v1/search, diferenciados por deporte y nivel. */
const SEARCH_TERMS: Record<Sport, Record<IntensityLevel, string[]>> = {
  running: {
    baja: [
      "lo-fi running",
      "jogging suave español",
      "acoustic indie folk",
      "calm electronic ambient",
      "rodaje relajado",
    ],
    moderada: [
      "running indie rock",
      "rock en español running",
      "steady beats workout",
      "alternative rock run",
      "pop rock rodaje",
    ],
    alta: [
      "running workout high energy",
      "drum and bass run",
      "electronic intervals",
      "edm correr fuerte",
      "hard rock sprints",
    ],
  },
  cycling: {
    baja: [
      "cycling chill",
      "recuperación ciclismo",
      "ambient bike ride",
      "soft rock cruising",
      "lofi bici",
    ],
    moderada: [
      "cycling indie rock",
      "rock en español bici",
      "steady ride beats",
      "alternative cycling",
      "pop rock ciclismo",
    ],
    alta: [
      "cycling high energy",
      "electronic bike intervals",
      "edm cycling climb",
      "drum and bass ride",
      "ciclismo intenso",
    ],
  },
};

function profile(level: IntensityLevel, sport: Sport) {
  return {
    level,
    label: LABEL[level],
    searchTerms: SEARCH_TERMS[sport][level],
    targetEnergy: ENERGY[level],
    targetTempoBpm: BPM[level],
  };
}

/**
 * Minutos de la sesión: duración declarada, si no la suma de los pasos del workout,
 * si no la distancia por el ritmo promedio, y si no un valor por defecto.
 */
function estimateMinutes(session: any, sport: Sport): number {
  const duration = Number(session?.duration_min);
  if (Number.isFinite(duration) && duration > 0) return duration;

  // `endConditionValue` viene en segundos cuando la condición es de tiempo.
  const seconds = extractSteps(session).reduce((total, step) => {
    const v = Number(step?.endConditionValue);
    return total + (Number.isFinite(v) && v > 0 && v < 1_000_000 ? v : 0);
  }, 0);
  if (seconds > 0) return Math.round(seconds / 60);

  const km = Number(session?.distance_km);
  if (Number.isFinite(km) && km > 0) return Math.round(km * MIN_PER_KM[sport]);

  return DEFAULT_MINUTES[sport];
}

/**
 * Deriva la intensidad de una sesión del plan. Las sesiones vienen sin tipar y muy
 * disparejas: las de Runna solo traen `name`, `sport` y `distance_km`, mientras que las
 * de ciclismo generadas en el backend traen `duration_min`, `primary_zone`, `rationale`
 * y el workout completo de Garmin.
 *
 * Prioridad: zona declarada > pasos del workout > texto de la sesión > moderada.
 */
export function deriveIntensity(session: any): SessionIntensity {
  const sport = deriveSport(session);
  const estimatedMinutes = estimateMinutes(session, sport);

  // Z1 recuperación · Z2-Z3 resistencia/tempo · Z4-Z5 umbral y VO2max.
  const zone = parseZone(session);
  if (zone != null) {
    const level: IntensityLevel = zone <= 1 ? "baja" : zone <= 3 ? "moderada" : "alta";
    return { ...profile(level, sport), sport, estimatedMinutes, specified: true };
  }

  const level = levelFromSteps(extractSteps(session)) ?? levelFromText(sessionText(session));
  if (level) {
    return { ...profile(level, sport), sport, estimatedMinutes, specified: true };
  }

  return {
    ...profile("moderada", sport),
    sport,
    label: "Intensidad no especificada",
    estimatedMinutes,
    specified: false,
  };
}

/**
 * Devuelve la misma sesión con un nivel de intensidad forzado, conservando deporte,
 * duración estimada y la marca de "especificada". Se usa para el control manual de
 * intensidad del modal (generar la playlist a un nivel distinto del inferido).
 */
export function withLevel(intensity: SessionIntensity, level: IntensityLevel): SessionIntensity {
  return {
    ...profile(level, intensity.sport),
    sport: intensity.sport,
    estimatedMinutes: intensity.estimatedMinutes,
    specified: true,
  };
}

// ── Curva de energía por sesión (#1) ───────────────────────────────────────
// La playlist ya no se ordena al azahar: sigue la curva real de la sesión.
// Cada fase lleva una energía objetivo (0-1) y una duración en minutos, y el
// reparto de canciones entre fases es proporcional a esa duración.

export type SessionPhase = {
  /** Energía objetivo de la fase, 0-1. */
  energy: number;
  /** Minutos que dura la fase en la sesión. */
  minutes: number;
  /** Etiqueta legible para logs / debug ("Calentamiento", "Bloque principal"...). */
  label: string;
};

/** Traduce una zona (1-5) a energía 0-1, alineada con los niveles de intensidad. */
function energyFromZone(zone: number): number {
  if (zone >= 5) return 0.95;
  if (zone >= 4) return 0.85;
  if (zone >= 3) return 0.6;
  if (zone >= 2) return 0.4;
  return 0.25;
}

/**
 * Construye las fases de la sesión a partir de los pasos del workout de Garmin.
 * Agrupa pasos consecutivos del mismo rol (calentamiento / cuerpo / enfriamiento)
 * y les asigna la energía de la zona que exigen. Si un paso no declara zona,
 * hereda la del bloque al que pertenece.
 */
function phasesFromSteps(steps: Step[]): SessionPhase[] | null {
  if (steps.length === 0) return null;
  const phases: SessionPhase[] = [];

  // Energía por defecto de cada rol, por si el paso no declara zona.
  const roleEnergy = (key: string): number => {
    if (/warmup/.test(key)) return 0.3;
    if (/cooldown|rest|recovery/.test(key)) return 0.25;
    return 0.7;
  };

  for (const step of steps) {
    const key = stepTypeKey(step);
    const sec = stepSeconds(step);
    if (sec <= 0) continue; // ignoramos pasos sin duración medible
    const zone = stepMaxZone(step);
    const energy = zone != null ? energyFromZone(zone) : roleEnergy(key);
    const label = /warmup/.test(key)
      ? "Calentamiento"
      : /cooldown/.test(key)
        ? "Enfriamiento"
        : /rest|recovery/.test(key)
          ? "Recuperación"
          : "Bloque principal";
    phases.push({ energy, minutes: Math.round(sec / 60), label: `${label} · ${mmss(sec)}` });
  }

  return phases.length > 0 ? phases : null;
}

/**
 * Curva genérica para sesiones SIN workout detallado (las de Runna, que solo
 * traen `name`). Cada nivel dibuja una forma distinta:
 *   • baja     → meseta suave (calentamiento breve + cuerpo plano).
 *   • moderada → subida gradual (el ritmo aprieta hacia la mitad-final).
 *   • alta     → dientes de sierra: calentamiento, varios picos de calidad con
 *                valles de recuperación, y enfriamiento.
 */
function phasesFromLevel(level: IntensityLevel, minutes: number): SessionPhase[] {
  if (level === "alta") {
    // Reparto típico: 12% calentamiento, 10% enfriamiento, 78% en calidad.
    const warm = Math.max(6, Math.round(minutes * 0.12));
    const cool = Math.max(5, Math.round(minutes * 0.1));
    const body = Math.max(1, minutes - warm - cool);
    // El cuerpo se divide en 3-4 intervalos con recuperación entre medias.
    const rounds = Math.min(4, Math.max(2, Math.round(body / 12)));
    const roundLen = body / (rounds * 2 - 1);
    const phases: SessionPhase[] = [{ energy: 0.35, minutes: warm, label: "Calentamiento" }];
    for (let i = 0; i < rounds; i++) {
      phases.push({
        energy: 0.9,
        minutes: Math.max(1, Math.round(roundLen)),
        label: `Intervalo ${i + 1}`,
      });
      if (i < rounds - 1) {
        phases.push({
          energy: 0.4,
          minutes: Math.max(1, Math.round(roundLen * 0.6)),
          label: `Recuperación ${i + 1}`,
        });
      }
    }
    phases.push({ energy: 0.3, minutes: cool, label: "Enfriamiento" });
    return phases;
  }

  if (level === "moderada") {
    // Subida gradual: 3 tramos de energía creciente.
    const warm = Math.max(6, Math.round(minutes * 0.15));
    const cool = Math.max(5, Math.round(minutes * 0.1));
    const body = Math.max(2, minutes - warm - cool);
    const mid = Math.round(body * 0.45);
    return [
      { energy: 0.35, minutes: warm, label: "Calentamiento" },
      { energy: 0.5, minutes: mid, label: "Rodaje inicial" },
      { energy: 0.65, minutes: Math.max(1, body - mid), label: "Rodaje fuerte" },
      { energy: 0.3, minutes: cool, label: "Enfriamiento" },
    ];
  }

  // baja: meseta suave, calentamiento corto y cuerpo plano conversacional.
  const warm = Math.max(5, Math.round(minutes * 0.12));
  const cool = Math.max(5, Math.round(minutes * 0.1));
  return [
    { energy: 0.3, minutes: warm, label: "Calentamiento" },
    { energy: 0.25, minutes: Math.max(1, minutes - warm - cool), label: "Rodaje suave" },
    { energy: 0.22, minutes: cool, label: "Enfriamiento" },
  ];
}

/**
 * Devuelve las fases (curva de energía) de una sesión. Si la sesión trae
 * `garmin_workout`, se construye a partir de los pasos reales; si no, se usa
 * una curva genérica según el nivel de intensidad derivado.
 */
export function buildSessionPhases(session: any, intensity: SessionIntensity): SessionPhase[] {
  const fromSteps = phasesFromSteps(extractSteps(session));
  if (fromSteps && fromSteps.length > 0) return fromSteps;
  return phasesFromLevel(intensity.level, intensity.estimatedMinutes);
}
