import { parseDate, startOfDay } from "@/lib/session-dates";

export type ReadinessResult = {
  score: number;
  label: string;
  color: "red" | "amber" | "green";
  baseHrv: number;
  baseRhr: number;
  todayHrv: number;
  todayRhr: number;
};

/** Días que entran en la base móvil (los previos al día actual). */
const BASELINE_DAYS = 7;
/** Sin al menos esta cantidad de días previos la base no significa nada. */
const MIN_HISTORY_DAYS = 3;

/**
 * Desviación relativa que se considera el extremo de cada métrica. El HRV oscila
 * mucho más que la FC en reposo: un +20% de HRV y un -8% de FC son señales
 * comparables, así que cada una se normaliza contra su propia escala.
 */
const HRV_FULL_SWING = 0.2;
const RHR_FULL_SWING = 0.08;

type Reading = { time: number; value: number };

/**
 * Serie diaria ordenada y sin duplicados. Garmin puede repetir una fecha (varias
 * lecturas del mismo día); en ese caso gana la última del arreglo.
 */
function readSeries(raw: unknown, field: string): Reading[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<number, Reading>();
  for (const entry of raw as Record<string, unknown>[]) {
    const value = Number(entry?.[field]);
    const date = parseDate(entry);
    if (!date || !Number.isFinite(value) || value <= 0) continue;
    const time = startOfDay(date).getTime();
    byDay.set(time, { time, value });
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time);
}

/**
 * Último valor disponible ("hoy") y la media de los días previos. Igual que los minis
 * de HRV/FC de la barra lateral, el día actual es la lectura más reciente: los datos de
 * Garmin llegan con retraso y exigir la fecha calendario dejaría la tarjeta vacía.
 */
function split(series: Reading[]): { today: number; base: number } | null {
  if (series.length < MIN_HISTORY_DAYS + 1) return null;
  const today = series[series.length - 1].value;
  const history = series.slice(-1 - BASELINE_DAYS, -1);
  const base = history.reduce((total, r) => total + r.value, 0) / history.length;
  return base > 0 ? { today, base } : null;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Desviación relativa → 0-100, con la base en 50. */
function normalize(relative: number, fullSwing: number): number {
  return clamp(50 + (relative / fullSwing) * 50, 0, 100);
}

function classify(score: number): { label: string; color: ReadinessResult["color"] } {
  if (score < 40) return { label: "Fatiga", color: "red" };
  if (score <= 70) return { label: "Mixto", color: "amber" };
  return { label: "Listo", color: "green" };
}

/**
 * Disposición para entrenar hoy, comparando HRV y FC en reposo contra su base móvil
 * de los últimos 7 días. HRV alto = recuperado; FC en reposo baja = recuperado.
 * Devuelve null cuando no hay historial suficiente para que la base tenga sentido.
 */
/** `garmin` es la respuesta de GET /garmin (o cualquier objeto con health.hrv/resting_hr). */
export function getReadinessScore(garmin: unknown): ReadinessResult | null {
  const g = garmin as
    | { health?: { hrv?: unknown; resting_hr?: unknown }; hrv?: unknown; resting_hr?: unknown }
    | null
    | undefined;
  const hrv = split(readSeries(g?.health?.hrv ?? g?.hrv, "hrv"));
  const rhr = split(readSeries(g?.health?.resting_hr ?? g?.resting_hr, "resting_hr"));
  if (!hrv || !rhr) return null;

  const hrvScore = normalize((hrv.today - hrv.base) / hrv.base, HRV_FULL_SWING);
  const rhrScore = normalize((rhr.base - rhr.today) / rhr.base, RHR_FULL_SWING);
  const score = Math.round((hrvScore + rhrScore) / 2);

  return {
    score,
    ...classify(score),
    baseHrv: Math.round(hrv.base),
    baseRhr: Math.round(rhr.base),
    todayHrv: Math.round(hrv.today),
    todayRhr: Math.round(rhr.today),
  };
}

/** Tokens de color para cada nivel, compartidos por chrome, Hoy y Cuerpo. */
export const READINESS_COLORS: Record<ReadinessResult["color"], string> = {
  red: "var(--err)",
  amber: "var(--warn)",
  green: "var(--ok)",
};

/**
 * Última lectura disponible de una métrica, formateada como string. Garmin repite
 * fechas y los datos llegan con retraso, así que se toma la última entrada no nula.
 */
export function latestReading(garmin: unknown, field: "hrv" | "resting_hr"): string {
  const g = garmin as { health?: Record<string, unknown> } | null | undefined;
  const arr = g?.health?.[field];
  if (!Array.isArray(arr)) return "—";
  const last = (arr as Record<string, unknown>[]).filter((h) => h?.[field] != null).at(-1);
  const v = last?.[field];
  return v != null && !isNaN(Number(v)) ? String(Math.round(Number(v))) : "—";
}
