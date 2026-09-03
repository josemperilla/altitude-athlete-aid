const BASE = ""; // rutas relativas — Vite proxy reenvía al backend en localhost:8503

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

export type GarminData = {
  activities?: any[];
  health?: any;
  hrv?: any[] | any;
  resting_hr?: any[] | any;
  zones?: any;
  [k: string]: any;
};

export type PlanData = {
  runna_sessions?: any[];
  cycling_sessions?: any[];
  weeks_plan?: any[];
  week_summary?: any[];
  athlete_state?: string | { state?: string; [k: string]: any };
  [k: string]: any;
};

export const garminQO = () => ({
  queryKey: ["garmin"] as const,
  queryFn: () => apiFetch<GarminData>("/garmin"),
  staleTime: 60_000,
});

export const planQO = () => ({
  queryKey: ["plan"] as const,
  queryFn: () => apiFetch<PlanData>("/plan"),
  staleTime: 60_000,
});

/** El bloque de fuerza que sirve /gym: sesiones, semanas, reglas y calendario. */
export type GymExercise = {
  prescription: string;
  load: string;
  id: string | null;
  name: string;
  target: string;
  anim: string | null;
  cues: string[];
  errors: string[];
  alt?: string;
};

export type GymBlock = {
  name: string;
  minutes: number;
  note: string | null;
  items: GymExercise[];
};

export type GymSession = {
  code: string;
  label: string | null;
  title: string;
  weekday: string;
  duration_min: number;
  summary: string;
  blocks: GymBlock[];
};

export type GymData = {
  race_date?: string;
  sessions?: Record<string, GymSession>;
  weeks?: any[];
  rules?: { rule: string; detail: string }[];
  calendar?: any[];
  generated_at?: string;
};

export const gymQO = () => ({
  queryKey: ["gym"] as const,
  queryFn: () => apiFetch<GymData>("/gym"),
  staleTime: 5 * 60_000,
});

export const insightsQO = () => ({
  queryKey: ["insights"] as const,
  queryFn: () => apiFetch<any>("/insights"),
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
  return apiFetch<any>("/update", { method: "POST", body: "" });
}

export function postDiagnose(data: DiagnoseInput) {
  return apiFetch<any>("/diagnose", { method: "POST", body: JSON.stringify(data) });
}

/** Estado del atleta como string en mayúsculas ("FATIGA", "DESCARGADO"...), sea string u objeto. */
export function getAthleteState(plan: PlanData | undefined): string {
  const s =
    typeof plan?.athlete_state === "string"
      ? plan.athlete_state
      : (plan?.athlete_state?.state ?? plan?.athlete_state?.label);
  return (s ?? "").toString().toUpperCase();
}
