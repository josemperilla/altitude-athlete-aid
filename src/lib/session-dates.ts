/**
 * Parsea una fecha en Date local. Acepta un string ("YYYY-MM-DD" se interpreta
 * como fecha local para evitar el shift UTC), un Date, o un objeto de sesión con
 * campos de fecha.
 */
export function parseDate(d: unknown): Date | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    return parseDate(o.date ?? o.day ?? o.scheduled_date ?? o.start ?? o.datetime);
  }
  const s = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Fecha de una sesión del plan (acepta sesión, string o Date). */
export function sessionDate(s: unknown): Date | null {
  return parseDate(s);
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

export function sameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function inRange(d: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  return d >= startOfDay(start) && d <= endOfDay(end);
}

/**
 * Domingo a sábado de la semana actual, inclusive.
 *
 * El backend planifica en semanas domingo→sábado (generate_plan.py:
 * build_user_message construye `week1_sun` como el domingo más reciente), así
 * que esta ventana tiene que coincidir. Con semana ISO (lunes→domingo) un
 * domingo caía en la semana *anterior* y el plan de la semana en curso
 * quedaba entero fuera del rango.
 */
export function thisWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const today = startOfDay(now);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/**
 * Extrae { start, end } de un objeto semana del plan, tolerando los distintos
 * nombres de campo que ha usado el backend (`week_start`/`start`/`start_date`/
 * `from`). Si falta el fin, se asume start+6 días (semana completa). Única
 * fuente de esta lógica — antes WeekBlock.tsx mantenía su propia copia
 * idéntica, con el riesgo de que un alias nuevo del backend se actualizara en
 * un solo lugar y no en el otro.
 */
export function parseWeekRange(w: Record<string, unknown> | null | undefined): {
  start: Date | null;
  end: Date | null;
} {
  const start = parseDate(w?.week_start ?? w?.start ?? w?.start_date ?? w?.from);
  const end = parseDate(w?.week_end ?? w?.end ?? w?.end_date ?? w?.to);
  if (start && !end) {
    const e = new Date(start);
    e.setDate(start.getDate() + 6);
    return { start, end: e };
  }
  return { start, end };
}

/**
 * Rango de la semana en curso según el propio plan (`weeks_plan`), que es la
 * fuente de verdad de qué sesiones se ven agrupadas en la interfaz. Si el plan
 * no trae la semana que contiene hoy (plan vacío o desactualizado), cae a
 * `thisWeekRange`.
 */
export function currentPlanWeekRange(
  weeks: Record<string, unknown>[] | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const today = startOfDay(now);
  for (const w of weeks ?? []) {
    const { start, end } = parseWeekRange(w);
    if (start && end && inRange(today, start, end)) return { start, end };
  }
  return thisWeekRange(now);
}

/** Deterministic key identifying a session, stable across reloads (sessions have no reliable id). */
export function sessionKey(session: unknown): string {
  const d = sessionDate(session);
  const dateStr = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : "unknown-date";
  const s = session as Record<string, unknown> | null | undefined;
  const name = String(s?.name ?? s?.sport ?? s?.type ?? "session");
  return `${dateStr}:${name}`;
}

/**
 * Une sesiones repetidas en una sola, conservando los campos de todas.
 *
 * Hay dos fuentes de repetición:
 *  1. `runna_sessions` incluye las sesiones de ciclismo ya agendadas en Garmin,
 *     así que la misma sesión puede venir también en `cycling_sessions` — con
 *     datos distintos (`duration_min`, `primary_zone`, `rationale` solo están en
 *     la versión local; `garmin_workout` solo en la de Garmin). Por eso se
 *     fusionan en vez de descartar la segunda.
 *  2. El calendario de Garmin devuelve la rejilla completa del mes, y meses
 *     consecutivos se solapan. Eso ya se corrige en el backend
 *     (fetch_garmin.py: fetch_scheduled_workouts), pero un plan generado antes
 *     de ese arreglo sigue en disco, así que la interfaz también lo tolera.
 *
 * Si dos sesiones con la misma key comparten un campo con valores distintos
 * (no solo una lo tiene y la otra no), gana la del grupo que llegó primero —
 * el orden de los argumentos importa. Hoy ningún campo se solapa así entre
 * `runna_sessions` y `cycling_sessions` (ver generate_plan.py:
 * build_runna_sessions, que no emite duration_min/primary_zone/rationale), así
 * que esto no se ha disparado nunca; queda anotado por si un campo nuevo del
 * backend rompe ese supuesto.
 */
export function dedupeSessions<T extends Record<string, unknown>>(...groups: T[][]): T[] {
  const byKey = new Map<string, T>();
  for (const session of groups.flat()) {
    const key = sessionKey(session);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...session });
      continue;
    }
    for (const [field, value] of Object.entries(session)) {
      if (value != null && (existing as Record<string, unknown>)[field] == null) {
        (existing as Record<string, unknown>)[field] = value;
      }
    }
  }
  return [...byKey.values()];
}
