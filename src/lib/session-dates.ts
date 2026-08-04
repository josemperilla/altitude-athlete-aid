/**
 * Parsea una fecha en Date local. Acepta un string ("YYYY-MM-DD" se interpreta
 * como fecha local para evitar el shift UTC), un Date, o un objeto de sesión con
 * campos de fecha.
 */
export function parseDate(d: any): Date | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === "object") {
    return parseDate(d?.date ?? d?.day ?? d?.scheduled_date ?? d?.start ?? d?.datetime);
  }
  const s = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Fecha de una sesión del plan (acepta sesión, string o Date). */
export function sessionDate(s: any): Date | null {
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

/** Lunes a domingo de la semana actual (inicio ISO), inclusive. */
export function thisWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const today = startOfDay(now);
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysSinceMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/** Deterministic key identifying a session, stable across reloads (sessions have no reliable id). */
export function sessionKey(session: any): string {
  const d = sessionDate(session);
  const dateStr = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : "unknown-date";
  const name = String(session?.name ?? session?.sport ?? session?.type ?? "session");
  return `${dateStr}:${name}`;
}

/**
 * `runna_sessions` incluye sesiones de ciclismo, así que la misma sesión puede venir en
 * los dos arreglos del plan. Sin esto se generarían dos playlists para una sola sesión.
 */
export function dedupeSessions(...groups: any[][]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const session of groups.flat()) {
    const key = sessionKey(session);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(session);
  }
  return out;
}
