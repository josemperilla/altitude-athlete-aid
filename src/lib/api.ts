// Cliente del backend. Cada query valida su respuesta contra el contrato de
// schemas.ts en el borde: las páginas reciben datos tipados, y las cadenas de
// fallback de alias que antes vivían en los componentes quedaron dentro de
// los esquemas.

import {
  parseWith,
  GarminDataSchema,
  PlanDataSchema,
  GymDataSchema,
  InsightsSchema,
  DiagnoseResultSchema,
  type GarminData,
  type PlanData,
  type GymData,
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
