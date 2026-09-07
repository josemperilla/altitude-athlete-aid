// Cliente del backend. Cada query valida su respuesta contra el contrato de
// schemas.ts en el borde: las páginas reciben datos tipados, y las cadenas de
// fallback de alias que antes vivían en los componentes quedaron dentro de
// los esquemas.

import {
  parseWith,
  GarminDataSchema,
  PlanDataSchema,
  GymDataSchema,
  GymDoneMapSchema,
  InsightsSchema,
  DiagnoseResultSchema,
  type GarminData,
  type PlanData,
  type GymData,
  type GymDoneMap,
  type Insights,
  type DiagnoseResult,
} from "@/lib/schemas";
import type { AthleteId } from "@/lib/athlete/store";

export type {
  GarminData,
  GarminActivity,
  PlanData,
  GymData,
  GymSession,
  GymBlock,
  GymExercise,
  GymDoneEntry,
  GymDoneMap,
  RaceInfo,
  Insights,
  InsightCategory,
  DiagnoseResult,
} from "@/lib/schemas";

const DEFAULT_ATHLETE: AthleteId = "jose";

/**
 * Toda ruta con datos de una persona lleva `?athlete=`, SIEMPRE y explícito —
 * también para "jose", aunque el backend lo tenga de default.
 *
 * La versión anterior lo omitía para jose por retrocompatibilidad, y eso dejaba
 * dos convenciones vivas a la vez: la lectura confiaba en un default implícito
 * y la escritura era explícita. En una app que usan dos personas, una petición
 * que no dice de quién es no se puede depurar mirando la red — y basta que el
 * default del backend cambie para que los datos de una terminen en el archivo
 * de la otra. Una sola regla: si la respuesta depende de quién pregunta, va el
 * parámetro.
 */
const athleteQS = (athlete: AthleteId) => `?athlete=${athlete}`;

const BASE = ""; // rutas relativas — el proxy de Vite (dev) o server.ts (prod) reenvían al backend

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const garminQO = (athlete: AthleteId = DEFAULT_ATHLETE) => ({
  queryKey: ["garmin", athlete] as const,
  queryFn: async (): Promise<GarminData> =>
    parseWith(GarminDataSchema, await apiFetch(`/garmin${athleteQS(athlete)}`), "GET /garmin"),
  staleTime: 60_000,
});

export const planQO = (athlete: AthleteId = DEFAULT_ATHLETE) => ({
  queryKey: ["plan", athlete] as const,
  queryFn: async (): Promise<PlanData> =>
    parseWith(PlanDataSchema, await apiFetch(`/plan${athleteQS(athlete)}`), "GET /plan"),
  staleTime: 60_000,
});

export const gymQO = (athlete: AthleteId = DEFAULT_ATHLETE) => ({
  queryKey: ["gym", athlete] as const,
  queryFn: async (): Promise<GymData> =>
    parseWith(GymDataSchema, await apiFetch(`/gym${athleteQS(athlete)}`), "GET /gym"),
  staleTime: 5 * 60_000,
});

/**
 * Vista conjunta: lo que CADA atleta marcó, para todo el bloque — por eso no
 * lleva `athlete` en la query, el backend siempre devuelve los dos.
 */
export const gymDoneQO = () => ({
  queryKey: ["gym-done"] as const,
  queryFn: async (): Promise<GymDoneMap> =>
    parseWith(GymDoneMapSchema, await apiFetch("/gym/done"), "GET /gym/done"),
  // Corta a propósito: los dos entrenan juntos y en el mismo rato, así que uno
  // marca en su teléfono y el otro tiene que verlo sin recargar. Es un JSON de
  // dos claves, sondearlo cada 20 s no cuesta nada.
  staleTime: 15_000,
  refetchInterval: 20_000,
  refetchOnWindowFocus: true,
});

export function postGymDone(
  input: {
    date: string;
    code: string;
    done?: boolean;
    note?: string;
    weights?: Record<string, string>;
  },
  athlete: AthleteId = DEFAULT_ATHLETE,
) {
  return apiFetch<GymDoneMap>(`/gym/done${athleteQS(athlete)}`, {
    method: "POST",
    body: JSON.stringify({ done: true, note: "", weights: {}, ...input }),
  });
}

/**
 * Latido del trabajo semanal. `last_run` es cuándo terminó bien por última vez
 * `run_weekly.sh` (fetch de Garmin → plan → subida), en ISO local, o `null` si
 * nunca ha corrido desde que se registra.
 *
 * Existe porque el plan lo genera un trabajo programado, y si ese trabajo deja
 * de correr nada en la app lo delata: se sigue viendo un plan, solo que viejo.
 * Ahora dependen dos personas de él, así que el silencio no sirve.
 */
export const healthQO = () => ({
  queryKey: ["health"] as const,
  queryFn: () => apiFetch<{ last_run?: string | null }>("/health"),
  staleTime: 5 * 60_000,
  retry: false,
});

export const insightsQO = () => ({
  queryKey: ["insights"] as const,
  queryFn: async (): Promise<Insights> =>
    parseWith(InsightsSchema, await apiFetch("/insights"), "GET /insights"),
  staleTime: 5 * 60_000,
});

export type DiagnoseInput = {
  location: string;
  severity: number;
  pain_type: string;
  when_occurs: string;
  duration: string;
  swelling: string;
  additional_notes: string;
};

/**
 * Dispara el fetch de Garmin + la generación del plan. NO lleva `athlete`: es
 * una tubería mono-atleta (corre con las credenciales de Garmin de Jose), y
 * fingir que acepta un perfil sería mentir sobre lo que hace. La UI la esconde
 * cuando el perfil activo no es el suyo.
 */
export function postUpdate() {
  return apiFetch<unknown>("/update", { method: "POST", body: "" });
}

/**
 * Historial de molestias. El contrato del backend no está fijado (devuelve lo
 * que Claude haya escrito), así que se consume sin tipar y `cuerpo.tsx` filtra
 * lo que reconoce. Lo que sí está fijo es de quién es: un archivo por atleta.
 */
export const diagnosisQO = (athlete: AthleteId = DEFAULT_ATHLETE) => ({
  queryKey: ["diagnosis", athlete] as const,
  queryFn: () => apiFetch<unknown>(`/diagnosis${athleteQS(athlete)}`),
  staleTime: 60_000,
  retry: false,
});

export function postDiagnose(data: DiagnoseInput, athlete: AthleteId = DEFAULT_ATHLETE) {
  return apiFetch<unknown>(`/diagnose${athleteQS(athlete)}`, {
    method: "POST",
    body: JSON.stringify(data),
  }).then((raw) => parseWith(DiagnoseResultSchema, raw, "POST /diagnose"));
}

/** Estado del atleta como string en mayúsculas ("FATIGA", "DESCARGADO"...), sea string u objeto. */
export function getAthleteState(plan: PlanData | undefined): string {
  const s =
    typeof plan?.athlete_state === "string"
      ? plan.athlete_state
      : (plan?.athlete_state?.state ?? plan?.athlete_state?.label);
  return (s ?? "").toString().toUpperCase();
}
