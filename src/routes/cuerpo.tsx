import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { apiFetch, garminQO, postDiagnose } from "@/lib/api";
import type { DiagnoseInput, DiagnoseResult, GarminActivity } from "@/lib/api";
import { PageShell } from "@/components/entrenador/PageShell";
import { Field, RangeInput, SelectInput, TextAreaInput } from "@/components/ui/field";

export const Route = createFileRoute("/cuerpo")({
  head: () => ({
    meta: [
      { title: "Cuerpo · Entrenador" },
      { name: "description", content: "Señales del cuerpo y evaluación de molestias." },
    ],
  }),
  component: CuerpoPage,
});

function CuerpoPage() {
  return (
    <PageShell title="Cuerpo" subtitle="Señales · Volumen · Molestias">
      <Señales />
      <DolorSection />
    </PageShell>
  );
}

// ── Señales: gráficas de adaptación + resumen de volumen ─────────────────────

function toSeries(
  arr: { date?: string | null; [k: string]: unknown }[] | null | undefined,
  valueKey: string,
): { date: string; value: number }[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((p) => p && p[valueKey] != null)
    .map((p) => ({ date: String(p.date).slice(5, 10), value: Number(p[valueKey]) }))
    .filter((p) => !isNaN(p.value));
}

type WeekSummary = { weekLabel: string; runMin: number; runKm: number; bikeMin: number };

function getISOWeekKey(dateStr: string): string {
  // Semana lunes-first. Devuelve "YYYY-MM-DD" del lunes de esa semana.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function aggregateWeeks(activities: GarminActivity[] | null | undefined): WeekSummary[] {
  if (!Array.isArray(activities)) return [];
  const buckets = new Map<string, WeekSummary>();
  for (const a of activities) {
    if (!a?.date) continue;
    const key = getISOWeekKey(a.date);
    const type = String(a.type ?? "").toLowerCase();
    const durMin = Number(a.duration_sec ?? 0) / 60;
    const km = Number(a.distance_m ?? 0) / 1000;
    const cur = buckets.get(key) ?? { weekLabel: key, runMin: 0, runKm: 0, bikeMin: 0 };
    if (type.includes("run")) {
      cur.runMin += durMin;
      cur.runKm += km;
    } else if (type.includes("cycl") || type.includes("bike")) {
      cur.bikeMin += durMin;
    }
    buckets.set(key, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
}

function Señales() {
  const { data: garmin } = useQuery(garminQO());

  const hrvSeries = toSeries(garmin?.health?.hrv, "hrv").slice(-30);
  const rhrSeries = toSeries(garmin?.health?.resting_hr, "resting_hr").slice(-30);
  const summaries = aggregateWeeks(garmin?.activities_last_3_weeks);

  return (
    <section>
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        <ChartCard title="HRV (ms)" data={hrvSeries} />
        <ChartCard title="FC reposo (bpm)" data={rhrSeries} />
      </div>

      <h2 className="eyebrow mt-10 mb-4">Resumen semanal</h2>
      {summaries.length === 0 ? (
        <div className="club-card p-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Sin resúmenes disponibles.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((w, i) => (
            <WeekSummaryCard key={i} w={w} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChartCard({ title, data }: { title: string; data: { date: string; value: number }[] }) {
  return (
    <div className="club-card p-5">
      <div className="eyebrow mb-3">{title}</div>
      <div className="h-[220px]">
        {data.length === 0 ? (
          <div
            className="h-full flex items-center justify-center text-sm"
            style={{ color: "var(--text-faint)" }}
          >
            Sin datos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="rgba(233,206,169,0.08)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(233,206,169,0.15)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 6,
                }}
                labelStyle={{ color: "var(--text-muted)" }}
                itemStyle={{ color: "var(--gold)" }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--gold)"
                strokeWidth={2}
                dot={{ fill: "var(--gold)", r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function WeekSummaryCard({ w }: { w: WeekSummary }) {
  const label = `Semana ${w.weekLabel.slice(5)}`;
  return (
    <div className="club-card p-5">
      <div className="eyebrow">{label}</div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Stat label="Carrera" value={w.runMin} suffix="min" digits={0} />
        <Stat label="Distancia" value={w.runKm} suffix="km" digits={1} />
        <Stat label="Bici" value={w.bikeMin} suffix="min" digits={0} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  digits = 0,
}: {
  label: string;
  value: number;
  suffix: string;
  digits?: number;
}) {
  const show = value > 0 ? value.toFixed(digits) : "—";
  return (
    <div>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="metric-num text-2xl leading-none mt-1">{show}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
        {suffix.toUpperCase()}
      </div>
    </div>
  );
}

// ── ¿Te duele algo?: diagnóstico de molestias ────────────────────────────────

const LOCATIONS = [
  "Rodilla",
  "Tobillo",
  "Cadera",
  "Gemelo",
  "Isquiotibial",
  "Cuádriceps",
  "Tendón de Aquiles",
  "Planta del pie",
  "Espalda baja",
  "Otro",
];
const PAIN_TYPES = ["Punzante", "Sordo", "Ardor", "Tirón", "Rigidez", "Inflamación"];
const WHEN = [
  "Al correr",
  "Al inicio",
  "Después de correr",
  "Al subir escaleras",
  "En reposo",
  "Al despertar",
];
const DURATIONS = ["< 1 día", "1-3 días", "1 semana", "> 2 semanas"];
const SWELLING = ["No", "Leve", "Moderada", "Severa"];

/** La normalización de aliases la hace el esquema (DiagnoseResultSchema). */
const LEVEL_STYLE: Record<string, string> = {
  SEVERE: "var(--err)",
  MODERATE: "var(--gold-light)",
  MINOR: "var(--gold)",
};

function DolorSection() {
  const [form, setForm] = useState<DiagnoseInput>({
    location: LOCATIONS[0],
    severity: 4,
    pain_type: PAIN_TYPES[0],
    when_occurs: WHEN[0],
    duration: DURATIONS[0],
    swelling: SWELLING[0],
    additional_notes: "",
  });

  const mut = useMutation({
    mutationFn: postDiagnose,
    onError: (e) => toast.error(`Error: ${e instanceof Error ? e.message : "no se pudo analizar"}`),
  });

  // GET /diagnosis existe en el backend pero su contrato no está fijado: se
  // muestra solo si responde una lista con forma reconocible.
  const { data: historyRaw } = useQuery({
    queryKey: ["diagnosis"],
    queryFn: () => apiFetch<unknown>("/diagnosis"),
    staleTime: 60_000,
    retry: false,
  });
  const history = useRecognizedDiagnoses(historyRaw);

  return (
    <section className="mt-12">
      <h2 className="eyebrow mb-3">¿Te duele algo?</h2>
      <form
        className="grid md:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate(form);
        }}
      >
        <Field label="Localización">
          <SelectInput
            value={form.location}
            options={LOCATIONS}
            onChange={(v) => setForm({ ...form, location: v })}
          />
        </Field>
        <Field label="Tipo de dolor">
          <SelectInput
            value={form.pain_type}
            options={PAIN_TYPES}
            onChange={(v) => setForm({ ...form, pain_type: v })}
          />
        </Field>
        <Field label="Cuándo ocurre">
          <SelectInput
            value={form.when_occurs}
            options={WHEN}
            onChange={(v) => setForm({ ...form, when_occurs: v })}
          />
        </Field>
        <Field label="Duración">
          <SelectInput
            value={form.duration}
            options={DURATIONS}
            onChange={(v) => setForm({ ...form, duration: v })}
          />
        </Field>
        <Field label="Inflamación">
          <SelectInput
            value={form.swelling}
            options={SWELLING}
            onChange={(v) => setForm({ ...form, swelling: v })}
          />
        </Field>
        <Field label={`Severidad · ${form.severity}/10`}>
          <RangeInput
            value={form.severity}
            min={1}
            max={10}
            onChange={(v) => setForm({ ...form, severity: v })}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notas adicionales">
            <TextAreaInput
              value={form.additional_notes}
              onChange={(v) => setForm({ ...form, additional_notes: v })}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <button type="submit" disabled={mut.isPending} className="btn-gold w-full md:w-auto">
            {mut.isPending ? "Analizando…" : "Analizar"}
          </button>
        </div>
      </form>

      {mut.data && <DiagnoseResultView result={mut.data} />}

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="eyebrow mb-2">Diagnósticos anteriores</h3>
          <div className="flex flex-col gap-2">
            {history.map((h, i) => {
              const date = typeof h.date === "string" ? h.date.slice(0, 10) : "";
              const where = typeof h.location === "string" ? h.location : "";
              const level = String(h.classification ?? h.severity_class ?? h.level ?? "");
              return (
                <div key={i} className="club-card p-3 text-sm flex flex-wrap gap-2">
                  {date && <span className="metric-num text-xs">{date}</span>}
                  <span style={{ color: "var(--text-muted)" }}>
                    {[where, level].filter(Boolean).join(" · ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Filtra el GET /diagnosis a objetos con algún campo reconocible. */
function useRecognizedDiagnoses(raw: unknown): Record<string, unknown>[] {
  return useMemo(() => {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is Record<string, unknown> =>
        !!x && typeof x === "object" && ("date" in x || "created_at" in x),
    );
  }, [raw]);
}

function DiagnoseResultView({ result }: { result: DiagnoseResult }) {
  const color = LEVEL_STYLE[result.level] ?? "var(--gold)";
  const cyclingAdjustments = result.cyclingAdjustments ?? [];
  const runnaWarnings = result.runnaWarnings ?? [];

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div className="club-card p-5" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="flex items-center gap-3">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
          <span style={{ color, fontWeight: 800, letterSpacing: "0.12em" }}>{result.level}</span>
        </div>
        {result.summary && (
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
            {String(result.summary)}
          </p>
        )}
      </div>

      {cyclingAdjustments.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Ajustes al ciclismo</h3>
          <div className="flex flex-col gap-2">
            {cyclingAdjustments.map((a, i) => (
              <div
                key={i}
                className="club-card p-3 text-sm"
                style={{ borderLeft: "3px solid var(--gold)" }}
              >
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {runnaWarnings.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2" style={{ color: "var(--err)" }}>
            Advertencias Runna
          </h3>
          <div className="flex flex-col gap-2">
            {runnaWarnings.map((a, i) => (
              <div
                key={i}
                className="club-card p-3 text-sm"
                style={{ borderLeft: "3px solid var(--err)" }}
              >
                {a}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
