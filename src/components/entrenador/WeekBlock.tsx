import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { SpotifyIcon } from "@/components/entrenador/SpotifyIcon";
import { SessionDetailModal } from "@/components/entrenador/SessionDetailModal";
import { getCreatedPlaylist, isSpotifyConnected, startSpotifyLogin } from "@/lib/spotify";
import { usePlaylistMutation } from "@/hooks/use-playlist-mutation";
import { garminQO } from "@/lib/api";
import type { GarminData, PlanSession, PlanWeek } from "@/lib/schemas";
import {
  inRange,
  parseWeekRange,
  sameDay,
  sessionDate,
  sessionKey,
  startOfDay,
} from "@/lib/session-dates";

// El backend genera semanas domingo→sábado (week_start = domingo), así que el
// grid se construye desde week_start tal cual, sin realinear a lunes: realinear
// haría que las sesiones del lunes-sábado quedaran fuera del grid.
const DAY_NAMES = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const SPORT_COLOR = { run: "var(--run)", bike: "var(--bike)" } as const;

export function WeekBlock({
  week,
  runs,
  bikes,
  index,
}: {
  week: PlanWeek;
  runs: PlanSession[];
  bikes: PlanSession[];
  index: number;
}) {
  const { start, end } = parseWeekRange(week);
  const rawType = (week?.type ?? `Semana ${index + 1}`).toString();
  const type = rawType.replace(/_/g, " ").toUpperCase();
  const purpose = week?.purpose ?? "";

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
  const cols: { date: Date | null; runs: PlanSession[]; bikes: PlanSession[] }[] = [];
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
    // Fallback sin week_start: bucket por día de semana. `getDay()` es
    // domingo=0, pero DAY_NAMES (y el índice `i` de este bucket) es
    // lunes-first — hay que traducir, si no cada columna queda un día corrida.
    const mondayFirst = (d: Date | null) => (d ? (d.getDay() + 6) % 7 : -1);
    for (let i = 0; i < 7; i++) {
      cols.push({
        date: null,
        runs: weekRuns.filter((s) => mondayFirst(sessionDate(s)) === i),
        bikes: weekBikes.filter((s) => mondayFirst(sessionDate(s)) === i),
      });
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className="px-3 py-1 rounded text-xs"
          style={{
            background: "var(--gold)",
            color: "var(--bg)",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {type}
        </span>
        {start && end && (
          <span className="text-xs text-muted tracking-[0.06em]">
            {fmt(start)} — {fmt(end)}
          </span>
        )}
      </div>
      {purpose && <p className="text-sm mb-4 text-muted">{purpose}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cols.map((c, i) => {
          const isToday = c.date && sameDay(c.date, today);
          return (
            <div
              key={i}
              className="rounded p-3 min-h-[140px] flex flex-col gap-2"
              style={{
                background: "var(--surface)",
                border: `1px solid ${isToday ? "var(--gold)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px]"
                  style={{
                    color: isToday ? "var(--gold)" : "var(--text-muted)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  {c.date ? DAY_NAMES[(c.date.getDay() + 6) % 7] : DAY_NAMES[i]}
                </span>
                {c.date && <span className="text-[10px] text-muted">{c.date.getDate()}</span>}
              </div>
              {c.runs.length === 0 && c.bikes.length === 0 && (
                <div className="text-[11px] mt-2 text-faint">—</div>
              )}
              {c.runs.map((s, idx) => (
                <SessionCard key={`r-${idx}`} session={s} kind="run" />
              ))}
              {c.bikes.map((s, idx) => (
                <SessionCard key={`b-${idx}`} session={s} kind="bike" />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SessionCard({ session, kind }: { session: PlanSession; kind: "run" | "bike" }) {
  const color = SPORT_COLOR[kind];
  const name = session?.name ?? (kind === "run" ? "Carrera" : "Ciclismo");
  const duration = session?.duration_min;
  const zone = session?.primary_zone ?? session?.zone;

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
        className="rounded px-2.5 py-2 text-xs cursor-pointer transition-colors bg-surface-2 hover:bg-gold/10"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div
          className="text-fg font-semibold leading-snug break-words"
          style={{ whiteSpace: "normal" }}
        >
          {String(name)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted">
          {duration != null && <span>{duration} min</span>}
          {zone != null && <span>· {String(zone)}</span>}
          {duration == null && <span>{kind === "run" ? "Carrera" : "Ciclismo"}</span>}
        </div>
        <PlaylistButton session={session} />
      </div>
      {open && <SessionDetailModal session={session} kind={kind} onClose={close} />}
    </>
  );
}

function PlaylistButton({ session }: { session: PlanSession }) {
  const key = sessionKey(session);
  const existing = getCreatedPlaylist(key);
  // Leemos el garmin cacheado para que el ajuste por fatiga (#8) tenga datos.
  const queryClient = useQueryClient();
  const garmin = queryClient.getQueryData<GarminData>(garminQO().queryKey) ?? undefined;

  const mut = usePlaylistMutation(session, key, garmin);

  const created = mut.data ?? existing;

  if (created) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(created.externalUrl, "_blank");
        }}
        className="mt-1 flex items-center gap-1 text-[10px] self-start text-muted"
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
      startSpotifyLogin().catch((e) =>
        toast.error(e instanceof Error ? e.message : "No se pudo conectar con Spotify"),
      );
      return;
    }
    mut.mutate(undefined);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mut.isPending}
      className="mt-1 flex items-center gap-1 text-[10px] self-start text-gold"
    >
      {mut.isPending ? <Loader2 size={11} className="animate-spin" /> : <SpotifyIcon size={11} />}
      {mut.isPending ? "Creando…" : "Playlist"}
    </button>
  );
}

const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
