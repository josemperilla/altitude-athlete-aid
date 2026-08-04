import { useMutation } from "@tanstack/react-query";
import { Music, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  createIntensityPlaylist,
  getCreatedPlaylist,
  isSpotifyConnected,
  startSpotifyLogin,
  SpotifyRateLimitError,
} from "@/lib/spotify";
import {
  parseDate,
  sessionDate,
  startOfDay,
  endOfDay,
  sameDay,
  sessionKey,
} from "@/lib/session-dates";

const DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

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

function inWeek(d: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  return d >= startOfDay(start) && d <= endOfDay(end);
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
    return d && (!start || inWeek(d, start, end));
  });
  const weekBikes = bikes.filter((s) => {
    const d = sessionDate(s);
    return d && (!start || inWeek(d, start, end));
  });

  // Build 7 day columns starting on Sunday
  const cols: { date: Date | null; runs: any[]; bikes: any[] }[] = [];
  if (start) {
    const s = startOfDay(start);
    // Align to Sunday (getDay 0 = Sun)
    const dayOffset = s.getDay();
    const sunday = new Date(s);
    sunday.setDate(s.getDate() - dayOffset);
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
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
            background: "#E9CEA9",
            color: "#020101",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {type}
        </span>
        {start && end && (
          <span className="text-xs" style={{ color: "#9A9A9A", letterSpacing: "0.06em" }}>
            {fmt(start)} — {fmt(end)}
          </span>
        )}
      </div>
      {purpose && (
        <p className="text-sm mb-4" style={{ color: "#9A9A9A" }}>
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
                background: "#0D0D0D",
                border: `1px solid ${isToday ? "#E9CEA9" : "rgba(233,206,169,0.12)"}`,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[10px]"
                  style={{
                    color: isToday ? "#E9CEA9" : "#9A9A9A",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  {DAYS[i]}
                </span>
                {c.date && (
                  <span className="text-[10px]" style={{ color: "#9A9A9A" }}>
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
  const color = kind === "run" ? "#3B82F6" : "#10B981";
  const name = session?.name ?? (kind === "run" ? "Carrera" : "Ciclismo");
  const duration = session?.duration_min;
  const zone = session?.primary_zone ?? session?.zone;
  const sport = session?.sport ?? session?.type;

  return (
    <div
      className="rounded px-2.5 py-2 text-xs"
      style={{ background: "#111", borderLeft: `3px solid ${color}` }}
    >
      <div
        className="text-white font-semibold leading-snug break-words"
        style={{ whiteSpace: "normal" }}
      >
        {String(name)}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]" style={{ color: "#9A9A9A" }}>
        {duration != null && <span>{duration} min</span>}
        {zone != null && <span>· {String(zone)}</span>}
        {duration == null && sport != null && <span>{String(sport)}</span>}
      </div>
      <PlaylistButton session={session} kind={kind} />
    </div>
  );
}

function PlaylistButton({ session, kind }: { session: any; kind: "run" | "bike" }) {
  const key = sessionKey(session, kind);
  const existing = getCreatedPlaylist(key);

  const mut = useMutation({
    mutationFn: () => createIntensityPlaylist(session, key),
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
        onClick={() => window.open(created.externalUrl, "_blank")}
        className="mt-1 flex items-center gap-1 text-[10px] self-start"
        style={{ color: "#9A9A9A" }}
      >
        <Check size={11} />
        Playlist lista
      </button>
    );
  }

  const handleClick = () => {
    if (!isSpotifyConnected()) {
      startSpotifyLogin();
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
      style={{ color: "#E9CEA9" }}
    >
      {mut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Music size={11} />}
      {mut.isPending ? "Creando…" : "Playlist"}
    </button>
  );
}

const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
