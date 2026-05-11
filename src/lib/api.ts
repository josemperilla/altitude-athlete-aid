const BASE = "https://puppet-wincing-frenzied.ngrok-free.dev";

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