import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { deriveIntensity, deriveSport, LABEL, type IntensityLevel } from "@/lib/spotify-intensity";
import { sessionDate, sessionKey } from "@/lib/session-dates";
import { extractSteps, mmss, stepLabel, stepMeasure } from "@/lib/workout-steps";
import {
  createIntensityPlaylist,
  getCreatedPlaylist,
  isSpotifyConnected,
  startSpotifyLogin,
  SpotifyRateLimitError,
} from "@/lib/spotify";
import { garminQO } from "@/lib/api";
import { BIKE, ERR, GOLD, RUN, WARN } from "@/lib/theme";

const SPORT_COLOR = { running: RUN, cycling: BIKE } as const;
const INTENSITY_COLOR: Record<IntensityLevel, string> = {
  baja: BIKE,
  moderada: WARN,
  alta: ERR,
};
const INTENSITY_LEVELS: IntensityLevel[] = ["baja", "moderada", "alta"];

/** Ritmo: Garmin lo entrega en m/s, y más rápido es un valor más alto. */
function paceRange(lo: number, hi: number): string {
  const fast = Math.max(lo, hi);
  const slow = Math.min(lo, hi);
  if (slow <= 0) return `${mmss(1000 / fast)} /km`;
  return fast === slow
    ? `${mmss(1000 / fast)} /km`
    : `${mmss(1000 / fast)}–${mmss(1000 / slow)} /km`;
}

function stepTarget(step: any): string | null {
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
function stepZone(step: any): string | null {
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
  session: any;
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
  const garmin = queryClient.getQueryData(garminQO().queryKey);

  const sport = kind ? (kind === "bike" ? "cycling" : "running") : deriveSport(session);
  const accent = SPORT_COLOR[sport];
  const intensity = deriveIntensity(session);
  const intensityColor = intensity.specified ? INTENSITY_COLOR[intensity.level] : "#9A9A9A";

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
          background: "#0D0D0D",
          border: "1px solid rgba(233,206,169,0.15)",
          borderTop: `3px solid ${accent}`,
        }}
      >
        <div
          className="sticky top-0 flex items-start gap-3 px-5 py-4"
          style={{
            background: "#0D0D0D",
            borderBottom: "1px solid rgba(233,206,169,0.1)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px]"
              style={{ color: accent, fontWeight: 700, letterSpacing: "0.12em" }}
            >
              {sport === "cycling" ? "CICLISMO" : "CARRERA"}
            </div>
            <h2 className="text-base mt-1 leading-snug break-words" style={{ color: "#fff" }}>
              {name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 mt-1"
            style={{ color: "#9A9A9A" }}
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
              <p className="text-sm leading-relaxed" style={{ color: "#C9C9C9" }}>
                {String(rationale)}
              </p>
            </Section>
          )}

          {workoutDescription && (
            <Section title="Descripción">
              <p className="text-sm leading-relaxed" style={{ color: "#C9C9C9" }}>
                {String(workoutDescription)}
              </p>
            </Section>
          )}

          {steps.length > 0 && (
            <Section title="Paso a paso">
              <div className="flex flex-col gap-2">
                {steps.map((step: any, i: number) => (
                  <StepRow key={i} step={step} />
                ))}
              </div>
            </Section>
          )}

          {steps.length === 0 && (
            <Section title="Tipo de sesión">
              <p className="text-sm" style={{ color: "#C9C9C9" }}>
                {runTypeFromName(name)} ·{" "}
                <span style={{ color: intensityColor }}>{intensity.label.toLowerCase()}</span>
              </p>
              <p className="text-xs mt-2" style={{ color: "#777" }}>
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

/**
 * Genera la playlist de la sesión permitiendo forzar un nivel de intensidad
 * distinto del inferido (idea #6). Regenerar sobreescribe el registro local.
 */
function PlaylistControl({ session, garmin }: { session: any; garmin: any }) {
  const key = sessionKey(session);
  const base = deriveIntensity(session);
  const [level, setLevel] = useState<IntensityLevel | null>(null);
  const selected = level ?? base.level;

  const mut = useMutation({
    mutationFn: () => createIntensityPlaylist(session, key, garmin, level ?? undefined),
    onSuccess: (result) => {
      toast.success(`Playlist creada · ${result.intensityLabel}`, {
        action: { label: "Abrir", onClick: () => window.open(result.externalUrl, "_blank") },
      });
    },
    onError: (e: any) => {
      if (e instanceof SpotifyRateLimitError) {
        toast.error(`Spotify: demasiadas solicitudes, intenta en ${e.retryAfterSeconds}s`);
      } else {
        toast.error(e?.message ?? "No se pudo crear la playlist");
      }
    },
  });

  const existing = getCreatedPlaylist(key);
  const created = mut.data ?? existing;

  const generate = () => {
    if (!isSpotifyConnected()) {
      startSpotifyLogin().catch((e: any) =>
        toast.error(e?.message ?? "No se pudo conectar con Spotify"),
      );
      return;
    }
    mut.mutate();
  };

  return (
    <Section title="Playlist de la sesión">
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          {INTENSITY_LEVELS.map((l) => {
            const active = selected === l;
            const color = INTENSITY_COLOR[l];
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLevel((prev) => (prev === l ? null : l))}
                className="flex-1 px-2 py-1.5 rounded text-[11px] transition-colors"
                style={{
                  background: active ? `${color}22` : "#111",
                  color: active ? color : "#9A9A9A",
                  border: `1px solid ${active ? color : "rgba(233,206,169,0.15)"}`,
                  fontWeight: 600,
                }}
              >
                {LABEL[l]}
              </button>
            );
          })}
        </div>
        <p className="text-[11px]" style={{ color: "#777" }}>
          {level
            ? level === base.level
              ? "Nivel inferido por la sesión."
              : `Nivel manual: ${LABEL[level].toLowerCase()}.`
            : `Intensidad inferida: ${base.label.toLowerCase()}.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={mut.isPending}
            className="btn-gold text-[11px] px-3 py-2"
          >
            {mut.isPending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Creando…
              </span>
            ) : created ? (
              "Regenerar playlist"
            ) : (
              "Generar playlist"
            )}
          </button>
          {created && (
            <a
              href={created.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px]"
              style={{ color: "#1ED760", fontWeight: 600 }}
            >
              <Check size={12} /> Abrir en Spotify
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Los grupos de repetición traen sus propios pasos anidados. */
function StepRow({ step, depth = 0 }: { step: any; depth?: number }) {
  const children: any[] = Array.isArray(step?.workoutSteps) ? step.workoutSteps : [];
  const iterations = Number(step?.numberOfIterations);

  if (children.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        <div
          className="text-[11px]"
          style={{ color: GOLD, fontWeight: 700, letterSpacing: "0.08em" }}
        >
          {Number.isFinite(iterations) && iterations > 1
            ? `REPETIR ×${iterations}`
            : stepLabel(step).toUpperCase()}
        </div>
        <div
          className="flex flex-col gap-2 pl-3"
          style={{ borderLeft: "1px solid rgba(233,206,169,0.15)" }}
        >
          {children.map((child: any, i: number) => (
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
    <div className="rounded px-3 py-2" style={{ background: "#111" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: "#fff", fontWeight: 600 }}>
          {stepLabel(step)}
        </span>
        {measure && (
          <span className="text-xs metric-num shrink-0" style={{ color: GOLD }}>
            {measure}
          </span>
        )}
      </div>
      {(target || zone) && (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]" style={{ color: "#9A9A9A" }}>
          {zone && (
            <span
              className="px-1.5 rounded"
              style={{ background: "rgba(233,206,169,0.1)", color: GOLD, fontWeight: 600 }}
            >
              {zone}
            </span>
          )}
          {target && <span>{target}</span>}
        </div>
      )}
      {description && (
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#8A8A8A" }}>
          {description}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="text-[10px] mb-2"
        style={{ color: "#9A9A9A", fontWeight: 700, letterSpacing: "0.12em" }}
      >
        {title.toUpperCase()}
      </h3>
      {children}
    </div>
  );
}

function Chip({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="px-2 py-1 rounded text-[11px]"
      style={{ background: `${color}1A`, color, fontWeight: 600, letterSpacing: "0.04em" }}
    >
      {children}
    </span>
  );
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
