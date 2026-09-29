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
  PerformanceSchema,
  type Performance,
  type GarminData,
  type PlanData,
  type GymData,
  type GymDoneMap,
  type Insights,
  type DiagnoseResult,
} from "@/lib/schemas";

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

export const garminQO = () => ({
  queryKey: ["garmin"] as const,
  queryFn: async (): Promise<GarminData> =>
    parseWith(GarminDataSchema, await apiFetch("/garmin"), "GET /garmin"),
  staleTime: 60_000,
});

export const planQO = () => ({
  queryKey: ["plan"] as const,
  queryFn: async (): Promise<PlanData> =>
    parseWith(PlanDataSchema, await apiFetch("/plan"), "GET /plan"),
  staleTime: 60_000,
});

export const gymQO = () => ({
  queryKey: ["gym"] as const,
  queryFn: async (): Promise<GymData> =>
    parseWith(GymDataSchema, await apiFetch("/gym"), "GET /gym"),
  staleTime: 5 * 60_000,
});

/** Las sesiones de gimnasio marcadas como hechas, para todo el bloque. */
export const gymDoneQO = () => ({
  queryKey: ["gym-done"] as const,
  queryFn: async (): Promise<GymDoneMap> =>
    parseWith(GymDoneMapSchema, await apiFetch("/gym/done"), "GET /gym/done"),
  staleTime: 60_000,
});

export function postGymDone(input: {
  date: string;
  code: string;
  done?: boolean;
  note?: string;
  weights?: Record<string, string>;
}) {
  return apiFetch<GymDoneMap>("/gym/done", {
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
 */
export const healthQO = () => ({
  queryKey: ["health"] as const,
  queryFn: () => apiFetch<{ last_run?: string | null }>("/health"),
  staleTime: 5 * 60_000,
  retry: false,
});

export const performanceQO = () => ({
  queryKey: ["performance"] as const,
  queryFn: async (): Promise<Performance> =>
    parseWith(PerformanceSchema, await apiFetch("/performance"), "GET /performance"),
  staleTime: 5 * 60_000,
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

/** Dispara el fetch de Garmin + el feed de Runna + la generación del plan. */
export function postUpdate() {
  return apiFetch<unknown>("/update", { method: "POST", body: "" });
}

/**
 * Historial de molestias. El contrato del backend no está fijado (devuelve lo
 * que Claude haya escrito), así que se consume sin tipar y `cuerpo.tsx` filtra
 * lo que reconoce.
 */
export const diagnosisQO = () => ({
  queryKey: ["diagnosis"] as const,
  queryFn: () => apiFetch<unknown>("/diagnosis"),
  staleTime: 60_000,
  retry: false,
});

export function postDiagnose(data: DiagnoseInput) {
  return apiFetch<unknown>("/diagnose", {
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
