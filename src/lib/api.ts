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
/** "jose" no manda ?athlete= — retrocompatible con lo que ya sirve el backend. */
const athleteQS = (athlete: AthleteId) => (athlete === DEFAULT_ATHLETE ? "" : `?athlete=${athlete}`);

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
  staleTime: 30_000,
});

export function postGymDone(
  input: { date: string; code: string; done?: boolean; note?: string; weights?: Record<string, string> },
  athlete: AthleteId = DEFAULT_ATHLETE,
) {
  // Explícito siempre (a diferencia de athleteQS): una escritura no debe
  // depender de un default implícito para saber a quién pertenece.
  return apiFetch<GymDoneMap>(`/gym/done?athlete=${athlete}`, {
    method: "POST",
    body: JSON.stringify({ done: true, note: "", weights: {}, ...input }),
  });
}

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

export function postUpdate() {
  return apiFetch<unknown>("/update", { method: "POST", body: "" });
}

export function postDiagnose(data: DiagnoseInput) {
  return apiFetch<unknown>("/diagnose", { method: "POST", body: JSON.stringify(data) }).then(
    (raw) => parseWith(DiagnoseResultSchema, raw, "POST /diagnose"),
  );
}

/** Estado del atleta como string en mayúsculas ("FATIGA", "DESCARGADO"...), sea string u objeto. */
export function getAthleteState(plan: PlanData | undefined): string {
  const s =
    typeof plan?.athlete_state === "string"
      ? plan.athlete_state
      : (plan?.athlete_state?.state ?? plan?.athlete_state?.label);
  return (s ?? "").toString().toUpperCase();
}
