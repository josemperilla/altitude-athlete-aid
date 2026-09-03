import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { deriveIntensity, deriveSport, type IntensityLevel } from "@/lib/spotify-intensity";
import { sessionDate } from "@/lib/session-dates";
import { extractSteps, mmss, stepLabel, stepMeasure, type Step } from "@/lib/workout-steps";
import { garminQO } from "@/lib/api";
import type { GarminData, PlanSession } from "@/lib/schemas";
import { PlaylistControl } from "./PlaylistControl";

const SPORT_COLOR = { running: "var(--run)", cycling: "var(--bike)" } as const;
const INTENSITY_COLOR: Record<IntensityLevel, string> = {
  baja: "var(--bike)",
  moderada: "var(--warn)",
  alta: "var(--err)",
};

/** Ritmo: Garmin lo entrega en m/s, y más rápido es un valor más alto. */
function paceRange(lo: number, hi: number): string {
  const fast = Math.max(lo, hi);
  const slow = Math.min(lo, hi);
  if (slow <= 0) return `${mmss(1000 / fast)} /km`;
  return fast === slow
    ? `${mmss(1000 / fast)} /km`
    : `${mmss(1000 / fast)}–${mmss(1000 / slow)} /km`;
}

function stepTarget(step: Step): string | null {
  const key = String(step?.targetType?.workoutTargetTypeKey ?? "").toLowerCase();
  const lo = Number(step?.targetValueOne);
  const hi = Number(step?.targetValueTwo);
  if (!key || key.includes("no.target") || !Number.isFinite(lo) || lo <= 0) return null;

  if (key.includes("pace") || key.includes("speed")) return paceRange(lo, hi);

  const range =
    Number.isFinite(hi) && hi > lo ? `${Math.round(lo)}–${Math.round(hi)}` : `${Math.round(lo)}`;
  if (key.includes("heart")) return `FC ${range} bpm`;
  if (key.includes("power")) return `${range} W`;
  if (key.includes("cadence")) return `${range} rpm`;
  return range;
}

/** Zona escrita en la descripción del paso ("FC: 100–125 bpm (Z1)"). */
function stepZone(step: Step): string | null {
  const m = /\bz\s?([1-5])\b/i.exec(String(step?.description ?? ""));
  return m ? `Z${m[1]}` : null;
}

/** Las de Runna solo traen el nombre, así que el tipo hay que leerlo de ahí. */
function runTypeFromName(name: string): string {
  const t = name.toLowerCase();
  if (/interval|repeat|series|sprint|strides?/.test(t)) return "Intervalos";
  if (/fartlek/.test(t)) return "Fartlek";
  if (/hill|cuesta|subida/.test(t)) return "Cuestas";
  if (/tempo|threshold|umbral/.test(t)) return "Tempo";
  if (/long run|largo|salida larga/.test(t)) return "Fondo largo";
  if (/progres/.test(t)) return "Progresivo";
  if (/race|marathon pace|ritmo de carrera/.test(t)) return "Ritmo de carrera";
  if (/easy|recovery|recuperaci|suave/.test(t)) return "Rodaje suave";
  return "Rodaje";
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function SessionDetailModal({
  session,
  kind,
  onClose,
}: {
  session: PlanSession | undefined;
  kind?: "run" | "bike";
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const queryClient = useQueryClient();
  const garmin = queryClient.getQueryData<GarminData>(garminQO().queryKey) ?? undefined;

  const sport = kind ? (kind === "bike" ? "cycling" : "running") : deriveSport(session);
  const accent = SPORT_COLOR[sport];
  const intensity = deriveIntensity(session);
  const intensityColor = intensity.specified
    ? INTENSITY_COLOR[intensity.level]
    : "var(--text-muted)";

  const name = String(session?.name ?? (sport === "cycling" ? "Ciclismo" : "Carrera"));
  const date = sessionDate(session);
  const distance = Number(session?.distance_km);
  const steps = extractSteps(session);
  const workoutDescription = session?.garmin_workout?.description;
  const rationale = session?.rationale;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: "rgba(2,1,1,0.82)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-xl sm:rounded-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderTop: `3px solid ${accent}`,
        }}
      >
        <div
          className="sticky top-0 flex items-start gap-3 px-5 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px]"
              style={{ color: accent, fontWeight: 700, letterSpacing: "0.12em" }}
            >
              {sport === "cycling" ? "CICLISMO" : "CARRERA"}
            </div>
            <h2 className="text-base mt-1 leading-snug break-words text-fg">{name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 mt-1 text-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {date && <Chip>{fmtDate(date)}</Chip>}
            <Chip>
              {intensity.estimatedMinutes} min
              {session?.duration_min == null ? " aprox." : ""}
            </Chip>
            {Number.isFinite(distance) && distance > 0 && <Chip>{distance} km</Chip>}
            <Chip color={intensityColor}>{intensity.label}</Chip>
          </div>

          {rationale && (
            <Section title="Objetivo">
              <p className="text-sm leading-relaxed text-muted">{String(rationale)}</p>
            </Section>
          )}

          {workoutDescription && (
            <Section title="Descripción">
              <p className="text-sm leading-relaxed text-muted">{String(workoutDescription)}</p>
            </Section>
          )}

          {steps.length > 0 && (
            <Section title="Paso a paso">
              <div className="flex flex-col gap-2">
                {steps.map((step, i) => (
                  <StepRow key={i} step={step} />
                ))}
              </div>
            </Section>
          )}

          {steps.length === 0 && (
            <Section title="Tipo de sesión">
              <p className="text-sm text-muted">
                {runTypeFromName(name)} ·{" "}
                <span style={{ color: intensityColor }}>{intensity.label.toLowerCase()}</span>
              </p>
              <p className="text-xs mt-2 text-faint">
                {intensity.specified
                  ? `Ritmo objetivo aproximado ${intensity.targetTempoBpm[0]}–${intensity.targetTempoBpm[1]} bpm de música.`
                  : "Esta sesión no declara zona ni pasos; la intensidad es una estimación."}
              </p>
            </Section>
          )}

          <PlaylistControl session={session} garmin={garmin} />
        </div>
      </div>
    </div>
  );
}

/** Los grupos de repetición traen sus propios pasos anidados. */
function StepRow({ step, depth = 0 }: { step: Step; depth?: number }) {
  const children: Step[] = Array.isArray(step?.workoutSteps) ? step.workoutSteps : [];
  const iterations = Number(step?.numberOfIterations);

  if (children.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-gold font-bold tracking-[0.08em]">
          {Number.isFinite(iterations) && iterations > 1
            ? `REPETIR ×${iterations}`
            : stepLabel(step).toUpperCase()}
        </div>
        <div className="flex flex-col gap-2 pl-3" style={{ borderLeft: "1px solid var(--border)" }}>
          {children.map((child, i) => (
            <StepRow key={i} step={child} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  const measure = stepMeasure(step);
  const target = stepTarget(step);
  const zone = stepZone(step);
  const description = step?.description ? String(step.description) : null;

  return (
    <div className="rounded px-3 py-2 bg-surface-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-fg font-semibold">{stepLabel(step)}</span>
        {measure && <span className="text-xs metric-num shrink-0">{measure}</span>}
      </div>
      {(target || zone) && (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
          {zone && (
            <span className="px-1.5 rounded bg-gold/10 text-gold font-semibold">{zone}</span>
          )}
          {target && <span>{target}</span>}
        </div>
      )}
      {description && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Chip({ children, color = "var(--gold)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="px-2 py-1 rounded text-[11px]"
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
