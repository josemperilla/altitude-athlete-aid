import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { SpotifyIcon } from "@/components/entrenador/SpotifyIcon";
import { SessionDetailModal } from "@/components/entrenador/SessionDetailModal";
import {
  createIntensityPlaylist,
  getCreatedPlaylist,
  isSpotifyConnected,
  startSpotifyLogin,
  SpotifyRateLimitError,
} from "@/lib/spotify";
import { garminQO } from "@/lib/api";
import {
  inRange,
  parseDate,
  sameDay,
  sessionDate,
  sessionKey,
  startOfDay,
} from "@/lib/session-dates";
import { BIKE, BG, CARD_1, CARD_2, GOLD, MUTED, PANEL, RUN } from "@/lib/theme";

// El backend genera semanas domingo→sábado (week_start = domingo), así que el
// grid se construye desde week_start tal cual, sin realinear a lunes: realinear
// haría que las sesiones del lunes-sábado quedaran fuera del grid.
const DAY_NAMES = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

function getWeekRange(w: any): { start: Date | null; end: Date | null } {
  const start = parseDate(w?.week_start ?? w?.start ?? w?.start_date ?? w?.from);
  const end = parseDate(w?.week_end ?? w?.end ?? w?.end_date ?? w?.to);
  if (start && !end) {
    const e = new Date(start);
    e.setDate(start.getDate() + 6);
    return { start, end: e };
  }
  return { start, end };
}

export function WeekBlock({
  week,
  runs,
  bikes,
  index,
}: {
  week: any;
  runs: any[];
  bikes: any[];
  index: number;
}) {
  const { start, end } = getWeekRange(week);
  const rawType = (
    week?.week_type ??
    week?.type ??
    week?.label ??
    `Semana ${index + 1}`
  ).toString();
  const type = rawType.replace(/_/g, " ").toUpperCase();
  const purpose = week?.purpose ?? week?.goal ?? week?.description ?? "";

  const today = startOfDay(new Date());

  const weekRuns = runs.filter((s) => {
    const d = sessionDate(s);
    return d && (!start || inRange(d, start, end));
  });
  const weekBikes = bikes.filter((s) => {
    const d = sessionDate(s);
    return d && (!start || inRange(d, start, end));
  });

  // Build 7 day columns starting on week_start (backend usa domingo→sábado).
  const cols: { date: Date | null; runs: any[]; bikes: any[] }[] = [];
  if (start) {
    const s = startOfDay(start);
    for (let i = 0; i < 7; i++) {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      cols.push({
        date: d,
        runs: weekRuns.filter((s) => sameDay(sessionDate(s), d)),
        bikes: weekBikes.filter((s) => sameDay(sessionDate(s), d)),
      });
    }
  } else {
    // fallback: just bucket by day-of-week
    for (let i = 0; i < 7; i++) {
      cols.push({
        date: null,
        runs: weekRuns.filter((s) => (sessionDate(s)?.getDay() ?? -1) === i),
        bikes: weekBikes.filter((s) => (sessionDate(s)?.getDay() ?? -1) === i),
      });
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className="px-3 py-1 rounded text-xs"
          style={{
            background: GOLD,
            color: BG,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {type}
        </span>
        {start && end && (
          <span className="text-xs" style={{ color: MUTED, letterSpacing: "0.06em" }}>
            {fmt(start)} — {fmt(end)}
          </span>
        )}
      </div>
      {purpose && (
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          {purpose}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cols.map((c, i) => {
          const isToday = c.date && sameDay(c.date, today);
          return (
            <div
              key={i}
              className="rounded p-3 min-h-[140px] flex flex-col gap-2"
              style={{
                background: PANEL,
                border: `1px solid ${isToday ? GOLD : "rgba(233,206,169,0.12)"}`,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px]"
                  style={{
                    color: isToday ? GOLD : MUTED,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  {c.date ? DAY_NAMES[(c.date.getDay() + 6) % 7] : DAY_NAMES[i]}
                </span>
                {c.date && (
                  <span className="text-[10px]" style={{ color: MUTED }}>
                    {c.date.getDate()}
                  </span>
                )}
              </div>
              {c.runs.length === 0 && c.bikes.length === 0 && (
                <div className="text-[11px] mt-2" style={{ color: "#555" }}>
                  —
                </div>
              )}
              {c.runs.map((s: any, idx: number) => (
                <SessionCard key={`r-${idx}`} session={s} kind="run" />
              ))}
              {c.bikes.map((s: any, idx: number) => (
                <SessionCard key={`b-${idx}`} session={s} kind="bike" />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SessionCard({ session, kind }: { session: any; kind: "run" | "bike" }) {
  const color = kind === "run" ? RUN : BIKE;
  const name = session?.name ?? (kind === "run" ? "Carrera" : "Ciclismo");
  const duration = session?.duration_min;
  const zone = session?.primary_zone ?? session?.zone;
  const sport = session?.sport ?? session?.type;

  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="rounded px-2.5 py-2 text-xs cursor-pointer transition-colors bg-[#111] hover:bg-[#1A1A1A]"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div
          className="text-white font-semibold leading-snug break-words"
          style={{ whiteSpace: "normal" }}
        >
          {String(name)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]" style={{ color: MUTED }}>
          {duration != null && <span>{duration} min</span>}
          {zone != null && <span>· {String(zone)}</span>}
          {duration == null && sport != null && <span>{String(sport)}</span>}
        </div>
        <PlaylistButton session={session} />
      </div>
      {open && <SessionDetailModal session={session} kind={kind} onClose={close} />}
    </>
  );
}

function PlaylistButton({ session }: { session: any }) {
  const key = sessionKey(session);
  const existing = getCreatedPlaylist(key);
  // Leemos el garmin cacheado para que el ajuste por fatiga (#8) tenga datos.
  const queryClient = useQueryClient();
  const garmin = queryClient.getQueryData(garminQO().queryKey);

  const mut = useMutation({
    mutationFn: () => createIntensityPlaylist(session, key, garmin),
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

  const created = mut.data ?? existing;

  if (created) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(created.externalUrl, "_blank");
        }}
        className="mt-1 flex items-center gap-1 text-[10px] self-start"
        style={{ color: MUTED }}
      >
        <Check size={11} />
        Playlist lista
      </button>
    );
  }

  // El card contenedor abre el detalle de la sesión: el botón no debe dispararlo.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSpotifyConnected()) {
      // startSpotifyLogin es async: sin este catch, un fallo de configuración
      // (Client ID ausente) deja el botón sin hacer absolutamente nada.
      startSpotifyLogin().catch((e: any) =>
        toast.error(e?.message ?? "No se pudo conectar con Spotify"),
      );
      return;
    }
    mut.mutate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mut.isPending}
      className="mt-1 flex items-center gap-1 text-[10px] self-start"
      style={{ color: GOLD }}
    >
      {mut.isPending ? <Loader2 size={11} className="animate-spin" /> : <SpotifyIcon size={11} />}
      {mut.isPending ? "Creando…" : "Playlist"}
    </button>
  );
}

const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
