// Las semanas del bloque de fuerza y qué día es hoy dentro de él.
//
// Vive aquí, fuera de la vista, por dos razones: `gimnasio.tsx` y
// `GymSessionCard.tsx` necesitaban la misma `todayISO()` y la tenían duplicada,
// y porque esta es la lógica que gobierna la semana puente del 5 al 11 de
// octubre — la más difícil de comprobar a ojo, y la única del módulo que se
// puede probar sin montar React.

export type SemanaGym = {
  start: string;
  end: string;
  sessions: { date: string; session: string }[];
};

/**
 * Fecha de hoy en horario local. `toISOString()` no sirve: a las 8 p.m. en
 * Bogotá ya es el día siguiente en UTC y la sesión quedaría marcada mañana.
 */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * `gym.weeks` llega como `unknown[]` desde el contrato (schemas.ts lo deja sin
 * tipar porque solo esta vista lo usa). Se estrecha campo a campo, y lo que no
 * calce se descarta en vez de romper la página.
 */
export function parseSemana(raw: unknown): SemanaGym | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.start !== "string" || typeof w.end !== "string") return null;
  const sessions: SemanaGym["sessions"] = [];
  for (const s of Array.isArray(w.sessions) ? w.sessions : []) {
    if (!s || typeof s !== "object") continue;
    const e = s as Record<string, unknown>;
    if (typeof e.date === "string" && typeof e.session === "string") {
      sessions.push({ date: e.date, session: e.session });
    }
  }
  return { start: w.start, end: w.end, sessions };
}

/**
 * La semana que contiene hoy; si el bloque aún no arranca, la siguiente que
 * quede por delante; si ya terminó, ninguna.
 *
 * Ojo: la semana del 5 al 11 de octubre existe y viene con `sessions: []` a
 * propósito (Jose recuperándose del medio maratón, Andrea en taper de Chicago).
 * Devolverla con cero sesiones NO es lo mismo que no encontrarla — quien
 * consume esto tiene que distinguir los dos casos.
 */
export function semanaVigente(weeks: unknown[] | undefined, hoy: string): SemanaGym | null {
  const parsed = (weeks ?? []).map(parseSemana).filter((w): w is SemanaGym => w !== null);
  return (
    parsed.find((w) => w.start <= hoy && hoy <= w.end) ?? parsed.find((w) => w.start > hoy) ?? null
  );
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "2026-09-07" → "Lun 7". Parsea a mano para no caer en el desfase UTC. */
export function diaCorto(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d}`;
}
