export function parseDate(d: any): Date | null {
  if (!d) return null;
  const s = typeof d === "string" ? d : (d?.date ?? d?.day ?? d?.start ?? d?.scheduled_date);
  if (!s) return null;
  // Treat YYYY-MM-DD as a local date (avoid UTC shift)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export function sessionDate(s: any): Date | null {
  return parseDate(s?.date ?? s?.day ?? s?.scheduled_date ?? s?.start ?? s?.datetime ?? s);
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

/** Today through the next Sunday, inclusive (today itself if today is Sunday). */
export function thisWeekRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = startOfDay(now);
  const daysUntilSunday = (7 - start.getDay()) % 7;
  const end = new Date(start);
  end.setDate(start.getDate() + daysUntilSunday);
  return { start, end };
}

/** Deterministic key identifying a session, stable across reloads (sessions have no reliable id). */
export function sessionKey(session: any, kind: "run" | "bike"): string {
  const d = sessionDate(session);
  const dateStr = d ? d.toISOString().slice(0, 10) : "unknown-date";
  const name = String(session?.name ?? session?.sport ?? session?.type ?? "session");
  return `${kind}:${dateStr}:${name}`;
}
