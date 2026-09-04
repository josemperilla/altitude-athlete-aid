// Contratos del backend, validados con zod en el borde de la red.
//
// Principio: tolerantes primero. El backend ha cambiado nombres de campos
// varias veces (week_start/start/start_date/from…, classification/
// severity_class/level/category…), así que los alias se normalizan AQUÍ, una
// sola vez, y el resto de la app consume la forma canónica. Cada campo usa
// `.catch(undefined)`: un campo con tipo inesperado desaparece (se comporta
// como ausente) en vez de tumbar el contrato entero. Y si la respuesta no
// valida en absoluto, `parseWith` registra el problema y devuelve el dato
// crudo: la app degrada como siempre ha degradado, nunca se rompe por un
// campo nuevo del backend.

import { z } from "zod";

// ── Helpers ─────────────────────────────────────────────────────────────────

const optStr = z.string().nullish().catch(undefined);
const optNum = z.number().nullish().catch(undefined);
const optStrNum = z.union([z.string(), z.number()]).nullish().catch(undefined);

/**
 * Valida contra el esquema; ante fallo devuelve el dato crudo con un warning.
 * El backend es inestable por diseño (lo regenera un LLM): perder el tipado
 * de una respuesta es aceptable, perder la página no.
 *
 * El genérico va sobre el esquema completo (y no sobre `ZodType<T>`) porque
 * los campos con `.catch()`/`.transform()` tienen tipo de entrada ≠ salida.
 */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  label: string,
): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  console.warn(
    `[schemas] ${label}: contrato incumplido, se usa el dato sin tipar`,
    r.error.issues.slice(0, 3),
  );
  return data as z.output<S>;
}

/**
 * Arreglo tolerante elemento a elemento.
 *
 * `z.array(X).catch([])` descarta la lista ENTERA cuando un solo elemento no
 * valida, y sin avisar: una sesión con un `null` entre ocho dejaba el plan de
 * la semana vacío y la app decía "Sin semanas planificadas", que es mentira.
 * Aquí se queda lo que sí valida y lo descartado se dice en consola.
 */
function lenientArray<S extends z.ZodTypeAny>(schema: S, label: string) {
  return z.unknown().transform((raw): z.output<S>[] => {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      console.warn(`[schemas] ${label}: se esperaba un arreglo, llegó ${typeof raw}`);
      return [];
    }
    const out: z.output<S>[] = [];
    const dropped: unknown[] = [];
    for (const item of raw) {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else dropped.push(r.error.issues[0]);
    }
    if (dropped.length) {
      console.warn(
        `[schemas] ${label}: ${dropped.length} de ${raw.length} elementos descartados`,
        dropped.slice(0, 3),
      );
    }
    return out;
  });
}

/** Lo mismo que `lenientArray`, para un objeto indexado por clave. */
function lenientRecord<S extends z.ZodTypeAny>(schema: S, label: string) {
  return z.unknown().transform((raw): Record<string, z.output<S>> => {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      if (raw != null) console.warn(`[schemas] ${label}: se esperaba un objeto`);
      return {};
    }
    const out: Record<string, z.output<S>> = {};
    const dropped: string[] = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = schema.safeParse(v);
      if (r.success) out[k] = r.data;
      else dropped.push(k);
    }
    if (dropped.length) {
      console.warn(`[schemas] ${label}: claves descartadas → ${dropped.join(", ")}`);
    }
    return out;
  });
}

// ── Workout de Garmin ───────────────────────────────────────────────────────
// Tipado manual (y no zod recursivo) a propósito: los workouts llegan con
// pasos anidados arbitrarios y `workout-steps.ts` ya los lee de forma
// tolerante campo a campo. Aquí solo declaramos la forma que esos helpers
// esperan encontrar.

export type WorkoutStep = {
  stepType?: { stepTypeKey?: string | null } & Record<string, unknown>;
  description?: string | null;
  endCondition?: { conditionTypeKey?: string | null } & Record<string, unknown>;
  endConditionValue?: number | null;
  numberOfIterations?: number | null;
  targetType?: { workoutTargetTypeKey?: string | null } & Record<string, unknown>;
  targetValueOne?: number | null;
  targetValueTwo?: number | null;
  workoutSteps?: WorkoutStep[];
} & Record<string, unknown>;

export type GarminWorkout = {
  description?: string | null;
  workoutSegments?: { workoutSteps?: WorkoutStep[] }[] | null;
} & Record<string, unknown>;

/** Pasa cualquier objeto (o undefined) dejándolo tipado como workout. */
const GarminWorkoutSchema = z.custom<GarminWorkout>().nullish().catch(undefined);

// ── GET /plan ───────────────────────────────────────────────────────────────

export const PlanSessionSchema = z
  .object({
    date: optStr,
    scheduled_date: optStr,
    name: optStr,
    sport: optStr,
    type: optStr,
    duration_min: optNum,
    distance_km: optNum,
    primary_zone: optStrNum,
    zone: optStrNum,
    rationale: optStr,
    garmin_workout: GarminWorkoutSchema,
  })
  .catchall(z.unknown());
export type PlanSession = z.infer<typeof PlanSessionSchema>;

/**
 * Semana del plan. La transformación resuelve los alias del backend a la forma
 * canónica { start, end, type, purpose } — la misma que `parseWeekRange` y
 * `WeekBlock` ya saben leer (listan `start`/`type` entre sus alias), así que
 * es retrocompatible con el código existente.
 */
export const PlanWeekSchema = z
  .object({
    id: optStrNum,
    week_start: optStr,
    start: optStr,
    start_date: optStr,
    from: optStr,
    week_end: optStr,
    end: optStr,
    end_date: optStr,
    to: optStr,
    week_type: optStr,
    type: optStr,
    label: optStr,
    purpose: optStr,
    goal: optStr,
    description: optStr,
  })
  .catchall(z.unknown())
  .transform((w) => ({
    ...w,
    start: w.week_start ?? w.start ?? w.start_date ?? w.from ?? undefined,
    end: w.week_end ?? w.end ?? w.end_date ?? w.to ?? undefined,
    type: w.week_type ?? w.type ?? w.label ?? undefined,
    purpose: w.purpose ?? w.goal ?? w.description ?? undefined,
  }));
export type PlanWeek = z.infer<typeof PlanWeekSchema>;

const AthleteStateSchema = z
  .union([z.string(), z.object({ state: optStr, label: optStr }).catchall(z.unknown())])
  .nullish()
  .catch(undefined);

export const PlanDataSchema = z
  .object({
    runna_sessions: lenientArray(PlanSessionSchema, "plan.runna_sessions"),
    cycling_sessions: lenientArray(PlanSessionSchema, "plan.cycling_sessions"),
    weeks_plan: lenientArray(PlanWeekSchema, "plan.weeks_plan"),
    athlete_state: AthleteStateSchema,
  })
  .catchall(z.unknown());
export type PlanData = z.infer<typeof PlanDataSchema>;

// ── GET /garmin ─────────────────────────────────────────────────────────────

export const GarminDataSchema = z
  .object({
    extracted_at: optStr,
    health: z
      .object({
        hrv: z
          .array(z.object({ date: optStr, hrv: optNum }).catchall(z.unknown()))
          .nullish()
          .catch(undefined),
        resting_hr: z
          .array(z.object({ date: optStr, resting_hr: optNum }).catchall(z.unknown()))
          .nullish()
          .catch(undefined),
        sleep: z.array(z.unknown()).nullish().catch(undefined),
      })
      .catchall(z.unknown())
      .nullish()
      .catch(undefined),
    activities_last_3_weeks: z
      .array(
        z
          .object({
            activity_id: optNum,
            date: optStr,
            type: optStr,
            name: optStr,
            duration_sec: optNum,
            distance_m: optNum,
            avg_hr: optNum,
            max_hr: optNum,
          })
          .catchall(z.unknown()),
      )
      .nullish()
      .catch(undefined),
    hr_zones: z.unknown().nullish().catch(undefined),
  })
  .catchall(z.unknown());
export type GarminData = z.infer<typeof GarminDataSchema>;
export type GarminActivity = NonNullable<GarminData["activities_last_3_weeks"]>[number];

// ── GET /gym ────────────────────────────────────────────────────────────────
// Este endpoint sirve un JSON local estable, así que aquí sí conviene ser
// estricto: si cambia, mejor que falle ruidoso en consola.

export const GymExerciseSchema = z.object({
  prescription: z.string(),
  load: z.string(),
  id: z.string().nullable(),
  name: z.string(),
  target: z.string(),
  anim: z.string().nullable(),
  cues: z.array(z.string()),
  errors: z.array(z.string()),
  alt: z.string().optional(),
});
export type GymExercise = z.infer<typeof GymExerciseSchema>;

export const GymBlockSchema = z.object({
  name: z.string(),
  minutes: z.number(),
  note: z.string().nullable(),
  items: z.array(GymExerciseSchema),
});
export type GymBlock = z.infer<typeof GymBlockSchema>;

export const GymSessionSchema = z.object({
  code: z.string(),
  label: z.string().nullable(),
  title: z.string(),
  weekday: z.string(),
  duration_min: z.number(),
  summary: z.string(),
  blocks: z.array(GymBlockSchema),
});
export type GymSession = z.infer<typeof GymSessionSchema>;

export const GymDataSchema = z
  .object({
    race_date: optStr,
    sessions: lenientRecord(GymSessionSchema, "gym.sessions"),
    weeks: z.array(z.unknown()).nullish().catch(undefined),
    rules: z
      .array(z.object({ rule: z.string(), detail: z.string() }))
      .nullish()
      .catch([]),
    calendar: z.array(z.unknown()).nullish().catch(undefined),
    generated_at: optStr,
  })
  .catchall(z.unknown());
export type GymData = z.infer<typeof GymDataSchema>;

// ── GET /insights ───────────────────────────────────────────────────────────

export const InsightSchema = z
  .object({
    source: optStr,
    title: optStr,
    finding: optStr,
    number: optStr,
    application: optStr,
  })
  .catchall(z.unknown());
export type Insight = z.infer<typeof InsightSchema>;

export const InsightCategorySchema = z
  .object({
    id: optStr,
    title: optStr,
    subtitle: optStr,
    icon: optStr,
    color: optStr,
    insights: lenientArray(InsightSchema, "insights.items"),
  })
  .catchall(z.unknown());
export type InsightCategory = z.infer<typeof InsightCategorySchema>;

export const InsightsSchema = lenientArray(InsightCategorySchema, "insights");
export type Insights = z.infer<typeof InsightsSchema>;

// ── POST /diagnose ──────────────────────────────────────────────────────────
// Normaliza la sopa de alias a una forma canónica de mostrar.

type AdjustmentInput = string | { description?: string | null; text?: string | null };

const AdjustmentItemSchema = z.union([
  z.string(),
  z.object({ description: optStr, text: optStr }).catchall(z.unknown()),
]);

const AdjustmentList = z.array(AdjustmentItemSchema).nullish().catch(undefined);

export const DiagnoseResultSchema = z
  .object({
    classification: optStr,
    severity_class: optStr,
    level: optStr,
    category: optStr,
    summary: optStr,
    message: optStr,
    recommendation: optStr,
    cycling_adjustments: AdjustmentList,
    bike_adjustments: AdjustmentList,
    runna_warnings: AdjustmentList,
    warnings: AdjustmentList,
    adjustments: z
      .object({ cycling: AdjustmentList, running: AdjustmentList })
      .catchall(z.unknown())
      .nullish()
      .catch(undefined),
  })
  .catchall(z.unknown())
  .transform((r) => {
    const raw = (r.classification ?? r.severity_class ?? r.level ?? r.category ?? "").toUpperCase();
    const level = raw.includes("SEVERE")
      ? "SEVERE"
      : raw.includes("MODER")
        ? "MODERATE"
        : raw.includes("MINOR") || raw.includes("MILD") || raw.includes("LEVE")
          ? "MINOR"
          : raw || "RESULTADO";

    const toText = (items: AdjustmentInput[] | undefined): string[] =>
      (items ?? []).map((a) =>
        typeof a === "string" ? a : (a.description ?? a.text ?? JSON.stringify(a)),
      );

    return {
      level,
      summary: r.summary ?? r.message ?? r.recommendation ?? undefined,
      cyclingAdjustments: toText(
        (r.cycling_adjustments ?? r.bike_adjustments ?? r.adjustments?.cycling) as
          | AdjustmentInput[]
          | undefined,
      ),
      runnaWarnings: toText(
        (r.runna_warnings ?? r.warnings ?? r.adjustments?.running) as AdjustmentInput[] | undefined,
      ),
    };
  });

export type DiagnoseResult = {
  level: string;
  summary?: string | null;
  cyclingAdjustments: string[];
  runnaWarnings: string[];
};
