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
function readSeries(raw: any, field: string): Reading[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<number, Reading>();
  for (const entry of raw) {
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
export function getReadinessScore(garmin: any): ReadinessResult | null {
  const hrv = split(readSeries(garmin?.health?.hrv ?? garmin?.hrv, "hrv"));
  const rhr = split(readSeries(garmin?.health?.resting_hr ?? garmin?.resting_hr, "resting_hr"));
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

/** Colores de la paleta para cada nivel, compartidos por barra lateral y nav móvil. */
export const READINESS_COLORS: Record<ReadinessResult["color"], string> = {
  red: "#EF4444",
  amber: "#FBBF24",
  green: "#10B981",
};
