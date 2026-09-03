import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { postDiagnose, type DiagnoseInput, type DiagnoseResult } from "@/lib/api";
import { PageShell } from "@/components/entrenador/PageShell";
import { CARD_2, ERR, GOLD, GOLD_LIGHT, MUTED } from "@/lib/theme";
import { toast } from "sonner";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico · Entrenador" },
      { name: "description", content: "Evaluación de molestias y ajustes al plan." },
    ],
  }),
  component: DiagnosticoPage,
});

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
const LEVEL_STYLE: Record<string, { color: string }> = {
  SEVERE: { color: ERR },
  MODERATE: { color: GOLD_LIGHT },
  MINOR: { color: GOLD },
};

function DiagnosticoPage() {
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

  return (
    <PageShell title="Diagnóstico" subtitle="Evaluación de molestias y ajuste de plan">
      <form
        className="grid md:grid-cols-2 gap-4 mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate(form);
        }}
      >
        <Field label="Localización">
          <Select
            value={form.location}
            options={LOCATIONS}
            onChange={(v) => setForm({ ...form, location: v })}
          />
        </Field>
        <Field label="Tipo de dolor">
          <Select
            value={form.pain_type}
            options={PAIN_TYPES}
            onChange={(v) => setForm({ ...form, pain_type: v })}
          />
        </Field>
        <Field label="Cuándo ocurre">
          <Select
            value={form.when_occurs}
            options={WHEN}
            onChange={(v) => setForm({ ...form, when_occurs: v })}
          />
        </Field>
        <Field label="Duración">
          <Select
            value={form.duration}
            options={DURATIONS}
            onChange={(v) => setForm({ ...form, duration: v })}
          />
        </Field>
        <Field label="Inflamación">
          <Select
            value={form.swelling}
            options={SWELLING}
            onChange={(v) => setForm({ ...form, swelling: v })}
          />
        </Field>
        <Field label={`Severidad · ${form.severity}/10`}>
          <input
            type="range"
            min={1}
            max={10}
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })}
            className="w-full gold-slider"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notas adicionales">
            <textarea
              value={form.additional_notes}
              onChange={(e) => setForm({ ...form, additional_notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                background: CARD_2,
                border: "1px solid rgba(233,206,169,0.2)",
                color: "#fff",
              }}
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

    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[11px]"
        style={{
          color: MUTED,
          letterSpacing: "0.12em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded text-sm outline-none"
      style={{ background: CARD_2, border: "1px solid rgba(233,206,169,0.2)", color: "#fff" }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DiagnoseResultView({ result }: { result: DiagnoseResult }) {
  const style = LEVEL_STYLE[result.level] ?? { color: GOLD };
  const summary = result.summary;
  const cyclingAdjustments = result.cyclingAdjustments ?? [];
  const runnaWarnings = result.runnaWarnings ?? [];

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div
        className="club-card p-5"
        style={{ borderColor: style.color, borderLeft: `4px solid ${style.color}` }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: style.color }} />
          <span style={{ color: style.color, fontWeight: 800, letterSpacing: "0.12em" }}>
            {result.level}
          </span>
        </div>
        {summary && (
          <p className="mt-3 text-sm" style={{ color: MUTED }}>
            {String(summary)}
          </p>
        )}
      </div>

      {cyclingAdjustments.length > 0 && (
        <div>
          <h3
            className="text-sm mb-2"
            style={{
              color: GOLD,
              letterSpacing: "0.12em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Ajustes al ciclismo
          </h3>
          <div className="flex flex-col gap-2">
            {cyclingAdjustments.map((a, i) => (
              <div
                key={i}
                className="club-card p-3 text-sm"
                style={{ borderLeft: `3px solid ${GOLD}` }}
              >
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {runnaWarnings.length > 0 && (
        <div>
          <h3
            className="text-sm mb-2"
            style={{
              color: ERR,
              letterSpacing: "0.12em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Advertencias Runna
          </h3>
          <div className="flex flex-col gap-2">
            {runnaWarnings.map((a, i) => (
              <div
                key={i}
                className="club-card p-3 text-sm"
                style={{ borderLeft: `3px solid ${ERR}` }}
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
