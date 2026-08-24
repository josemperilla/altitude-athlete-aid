import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { postDiagnose, type DiagnoseInput } from "@/lib/api";
import { PageHeader } from "@/components/entrenador/PageHeader";
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
    onError: (e: any) => toast.error(`Error: ${e?.message ?? "no se pudo analizar"}`),
  });

  return (
    <div className="p-6 md:p-10 max-w-[1100px] mx-auto">
      <PageHeader title="Diagnóstico" subtitle="Evaluación de molestias y ajuste de plan" />

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

      {mut.data && <DiagnoseResult result={mut.data} />}

      <style>{`
        .gold-slider { -webkit-appearance:none; appearance:none; height:6px; border-radius:999px; background:#1A1A1A; outline:none; }
        .gold-slider::-webkit-slider-runnable-track { height:6px; background:#E9CEA9; border-radius:999px; }
        .gold-slider::-moz-range-track { height:6px; background:#E9CEA9; border-radius:999px; }
        .gold-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:#CEA970; border:2px solid #020101; cursor:pointer; margin-top:-6px; }
        .gold-slider::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:#CEA970; border:2px solid #020101; cursor:pointer; }
      `}</style>
    </div>
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

function classify(result: any): { label: string; color: string; emoji: string } {
  const raw = (
    result?.classification ??
    result?.severity_class ??
    result?.level ??
    result?.category ??
    ""
  )
    .toString()
    .toUpperCase();
  if (raw.includes("SEVERE")) return { label: "SEVERE", color: ERR, emoji: "🔴" };
  if (raw.includes("MODER")) return { label: "MODERATE", color: GOLD_LIGHT, emoji: "🟠" };
  if (raw.includes("MINOR") || raw.includes("MILD") || raw.includes("LEVE"))
    return { label: "MINOR", color: GOLD, emoji: "🟡" };
  return { label: raw || "RESULTADO", color: GOLD, emoji: "🟡" };
}

function DiagnoseResult({ result }: { result: any }) {
  const c = classify(result);
  const cyclingAdjustments: any[] =
    result?.cycling_adjustments ?? result?.bike_adjustments ?? result?.adjustments?.cycling ?? [];
  const runnaWarnings: any[] =
    result?.runna_warnings ?? result?.warnings ?? result?.adjustments?.running ?? [];
  const summary = result?.summary ?? result?.message ?? result?.recommendation;

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div
        className="club-card p-5"
        style={{ borderColor: c.color, borderLeft: `4px solid ${c.color}` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{c.emoji}</span>
          <span style={{ color: c.color, fontWeight: 800, letterSpacing: "0.12em" }}>
            {c.label}
          </span>
        </div>
        {summary && (
          <p className="mt-3 text-sm" style={{ color: MUTED }}>
            {String(summary)}
          </p>
        )}
      </div>

      {Array.isArray(cyclingAdjustments) && cyclingAdjustments.length > 0 && (
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
                {typeof a === "string" ? a : (a?.description ?? a?.text ?? JSON.stringify(a))}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(runnaWarnings) && runnaWarnings.length > 0 && (
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
                {typeof a === "string" ? a : (a?.description ?? a?.text ?? JSON.stringify(a))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
