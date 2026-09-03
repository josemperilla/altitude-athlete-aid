import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Dumbbell, Flag, HeartPulse, Music, RefreshCw } from "lucide-react";
import { gymQO, insightsQO, planQO } from "@/lib/api";
import type { Insight, PlanSession, PlanWeek } from "@/lib/schemas";
import { useAthlete } from "@/hooks/use-athlete";
import { useUpdatePlan } from "@/hooks/use-update-plan";
import {
  currentPlanWeekRange,
  dedupeSessions,
  inRange,
  parseWeekRange,
  sameDay,
  sessionDate,
  startOfDay,
} from "@/lib/session-dates";
import { deriveSport } from "@/lib/spotify-intensity";
import { BLOCK_WEEKS, RACE_DATE, RACE_NAME, ALTITUDE_LABEL } from "@/lib/config";
import { READINESS_COLORS } from "@/lib/readiness";
import { stateColor, stateLabel } from "@/lib/athlete-state";
import { PageShell } from "@/components/entrenador/PageShell";
import { QueryState } from "@/components/entrenador/QueryState";
import { SessionDetailModal } from "@/components/entrenador/SessionDetailModal";
import { PlaylistControl } from "@/components/entrenador/PlaylistControl";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hoy · Entrenador" },
      { name: "description", content: "Tu día de entrenamiento de un vistazo." },
    ],
  }),
  component: HoyPage,
});

const DAY_INITIALS = ["D", "L", "M", "X", "J", "V", "S"];

/** Hash estable de string → entero, para picks deterministas por fecha. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function HoyPage() {
  const { plan, garmin, readiness, athleteState, isLoading } = useAthlete();
  const { data: gym } = useQuery(gymQO());
  const { data: insights } = useQuery(insightsQO());
  const update = useUpdatePlan();

  const today = startOfDay(new Date());
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Misma deduplicación que el calendario: una sola lista para Hoy y el strip.
  const { todaySessions, weekSessions, weekRange, weekMeta } = useMemo(() => {
    const cycling: PlanSession[] = (plan?.cycling_sessions ?? []).map((s) => ({
      ...s,
      sport: s.sport ?? "cycling",
    }));
    const all = dedupeSessions(plan?.runna_sessions ?? [], cycling);
    const range = currentPlanWeekRange(plan?.weeks_plan ?? []);
    const currentWeek = (plan?.weeks_plan ?? []).find((w) => {
      const { start, end } = parseWeekRange(w);
      return start && end && inRange(today, start, end);
    });
    return {
      todaySessions: all.filter((s) => sameDay(sessionDate(s), today)),
      weekSessions: all.filter((s) => {
        const d = sessionDate(s);
        return d && inRange(d, range.start, range.end);
      }),
      weekRange: range,
      weekMeta: currentWeek as PlanWeek | undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // Gimnasio del día: el calendario del backend trae fecha exacta; si no está,
  // cae al weekday declarado de la sesión ("Lunes"/"Miércoles").
  const gymToday = useMemo(() => {
    const sessions = gym?.sessions ?? {};
    const cal = (gym?.calendar ?? undefined) as
      | { date?: string; gym?: string | null }[]
      | undefined;
    const byDate = Array.isArray(cal) ? cal.find((c) => c?.date === todayIso)?.gym : null;
    if (byDate && sessions[byDate]) return sessions[byDate];
    const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const name = weekdays[today.getDay()];
    const byWeekday = Object.values(sessions).find((s) => s?.weekday === name);
    return byWeekday ?? null;
  }, [gym, todayIso, today]);

  // Insight del día: rotación determinista por fecha sobre todos los insights.
  const insightOfDay = useMemo(() => {
    const all: { ins: Insight; cat: string }[] = (insights ?? []).flatMap((c) =>
      (c.insights ?? []).map((ins) => ({ ins, cat: c.title ?? "" })),
    );
    if (all.length === 0) return null;
    return all[hashStr(todayIso) % all.length];
  }, [insights, todayIso]);

  // Días completos que faltan para la carrera (medianoche a medianoche local).
  const daysToRace = Math.round(
    (new Date(RACE_DATE + "T00:00:00").getTime() - today.getTime()) / 86_400_000,
  );
  // Progreso del bloque: siempre contra la fecha de carrera y no contra las
  // semanas del plan, que pueden estar desactualizadas y dejar la semana
  // actual como última (barra al 100 % con un mes por delante).
  const blockProgress = useMemo(() => {
    const total = BLOCK_WEEKS * 7;
    const elapsed = total - daysToRace;
    return Math.min(1, Math.max(0, elapsed / total));
  }, [daysToRace]);

  const stColor = stateColor(athleteState);
  const stLabel = stateLabel(athleteState);

  return (
    <PageShell
      title={today.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
      subtitle={ALTITUDE_LABEL}
    >
      {/* Cuenta regresiva a la carrera */}
      {daysToRace >= 0 && (
        <div className="club-card mt-6 p-5 flex flex-wrap items-center gap-5">
          <div
            className="flex items-center justify-center rounded-lg w-12 h-12 shrink-0"
            style={{ background: "var(--gold-wash)", color: "var(--gold)" }}
          >
            <Flag size={22} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="eyebrow">{RACE_NAME}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="metric-num text-3xl leading-none">{daysToRace}</span>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {daysToRace === 1 ? "día para la carrera" : "días para la carrera"}
              </span>
            </div>
            <div className="mt-3 h-1 rounded" style={{ background: "rgba(233,206,169,0.12)" }}>
              <div
                className="h-1 rounded"
                style={{ width: `${Math.round(blockProgress * 100)}%`, background: "var(--gold)" }}
              />
            </div>
          </div>
          <span className="eyebrow shrink-0">bloque {Math.round(blockProgress * 100)} %</span>
        </div>
      )}

      {/* Veredicto del cuerpo */}
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Link
          to="/cuerpo"
          className="club-card p-5 flex items-center gap-4"
          aria-label="Ver señales del cuerpo"
        >
          <HeartPulse
            size={22}
            style={{
              color: readiness ? READINESS_COLORS[readiness.color] : "var(--text-muted)",
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="eyebrow">Disposición</div>
            {readiness ? (
              <>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className="metric-num text-2xl leading-none"
                    style={{ color: READINESS_COLORS[readiness.color] }}
                  >
                    {readiness.score}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: READINESS_COLORS[readiness.color] }}
                  >
                    {readiness.label}
                  </span>
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  HRV {pct(readiness.todayHrv, readiness.baseHrv)} · FC{" "}
                  {pct(readiness.todayRhr, readiness.baseRhr)} vs base 7d
                </div>
              </>
            ) : (
              <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Sin historial suficiente todavía
              </div>
            )}
          </div>
          <ArrowRight size={16} style={{ color: "var(--text-muted)" }} />
        </Link>

        {athleteState && (
          <div
            className="club-card p-5 flex items-center gap-4"
            style={{
              background: `color-mix(in srgb, ${stColor} 8%, var(--surface))`,
              border: "none",
            }}
          >
            <div className="flex-1">
              <div className="eyebrow">Estado del plan</div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: stColor, letterSpacing: "0.08em" }}
              >
                {stLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      <QueryState
        isLoading={isLoading}
        error={undefined}
        loadingMessage="Cargando tu día…"
        isEmpty={false}
      >
        {/* Hoy toca */}
        <section className="mt-8">
          <h2 className="eyebrow mb-3">Hoy toca</h2>
          <div className="flex flex-col gap-4">
            {todaySessions.map((s, i) => (
              <TodaySessionCard key={i} session={s} garmin={garmin} />
            ))}
            {gymToday && (
              <Link to="/gimnasio" className="club-card p-5 flex items-center gap-4">
                <Dumbbell size={20} style={{ color: "var(--gold)" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    Gimnasio {gymToday.label ?? gymToday.code} · {gymToday.title.split(",")[0]}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    ~{gymToday.duration_min} min · abre la sesión completa
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "var(--text-muted)" }} />
              </Link>
            )}
            {todaySessions.length === 0 && !gymToday && (
              <div className="club-card p-6">
                <div className="text-sm font-semibold">Descanso</div>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  Hoy el cuerpo se construye descansando. Si amaneces con energía de sobra, hay
                  sesiones cortas en casa esperándote.
                </p>
                <Link
                  to="/gimnasio"
                  className="btn-ghost inline-flex items-center gap-2 mt-3 text-xs"
                >
                  <Dumbbell size={13} /> Sesiones en casa
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Esta semana */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="eyebrow">Esta semana</h2>
            <Link
              to="/plan"
              className="flex items-center gap-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Ver calendario <ArrowRight size={12} />
            </Link>
          </div>
          <div className="club-card p-4">
            {weekMeta?.type && (
              <div
                className="text-xs mb-3"
                style={{ color: "var(--gold)", fontWeight: 700, letterSpacing: "0.1em" }}
              >
                {String(weekMeta.type).replace(/_/g, " ").toUpperCase()}
              </div>
            )}
            <div className="grid grid-cols-7 gap-2">
              {weekDays(weekRange.start).map((d) => {
                const isToday = sameDay(d, today);
                const sessions = weekSessions.filter((s) => sameDay(sessionDate(s), d));
                return (
                  <div key={d.toISOString()} className="flex flex-col items-center gap-1.5">
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: isToday ? "var(--gold)" : "var(--text-faint)" }}
                    >
                      {DAY_INITIALS[d.getDay()]}
                    </span>
                    <div
                      className="w-full rounded py-1.5 flex items-center justify-center gap-1"
                      style={{
                        background: isToday ? "var(--gold-wash)" : "var(--surface-2)",
                        border: `1px solid ${isToday ? "var(--border-strong)" : "transparent"}`,
                      }}
                    >
                      {sessions.length === 0 ? (
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          —
                        </span>
                      ) : (
                        sessions.slice(0, 3).map((s, i) => (
                          <span
                            key={i}
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{
                              background:
                                deriveSport(s) === "cycling" ? "var(--bike)" : "var(--run)",
                            }}
                          />
                        ))
                      )}
                    </div>
                    <span className="text-[10px] metric-num" style={{ color: "var(--text-muted)" }}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            {weekMeta?.purpose && (
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                {String(weekMeta.purpose)}
              </p>
            )}
          </div>
        </section>

        {/* Para leer hoy */}
        {insightOfDay && (
          <section className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="eyebrow">Para leer hoy</h2>
              <Link
                to="/aprende"
                className="flex items-center gap-1 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                <BookOpen size={12} /> Biblioteca
              </Link>
            </div>
            <Link to="/aprende" className="club-card p-5 block">
              {insightOfDay.ins.source && (
                <div className="eyebrow" style={{ color: "var(--gold)" }}>
                  {insightOfDay.ins.source}
                </div>
              )}
              <div className="text-sm font-bold mt-1">{insightOfDay.ins.title}</div>
              {insightOfDay.ins.finding && (
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {insightOfDay.ins.finding}
                </p>
              )}
            </Link>
          </section>
        )}

        {/* Acciones */}
        <section className="mt-8 pb-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => update.mutate()}
            disabled={update.isPending}
            className="btn-gold flex items-center gap-2 text-xs"
          >
            <RefreshCw size={13} className={update.isPending ? "animate-spin" : undefined} />
            {update.isPending ? "Actualizando…" : "Actualizar plan"}
          </button>
          <Link to="/ajustes" className="btn-ghost flex items-center gap-2 text-xs">
            <Music size={13} /> Ajustes y Spotify
          </Link>
        </section>
      </QueryState>
    </PageShell>
  );
}

function TodaySessionCard({
  session,
  garmin,
}: {
  session: PlanSession;
  garmin?: ReturnType<typeof useAthlete>["garmin"];
}) {
  const [open, setOpen] = useState(false);
  const sport = deriveSport(session);
  const color = sport === "cycling" ? "var(--bike)" : "var(--run)";
  const distance = Number(session?.distance_km);

  return (
    <>
      <div className="club-card p-5" style={{ borderLeft: `3px solid ${color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow" style={{ color }}>
              {sport === "cycling" ? "CICLISMO" : "CARRERA"}
            </div>
            <div className="text-base font-semibold mt-1 break-words">
              {String(session?.name ?? (sport === "cycling" ? "Ciclismo" : "Carrera"))}
            </div>
            <div
              className="flex flex-wrap gap-2 mt-2 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {session?.duration_min != null && <span>{session.duration_min} min</span>}
              {Number.isFinite(distance) && distance > 0 && <span>· {distance} km</span>}
              {(session?.primary_zone ?? session?.zone) != null && (
                <span>· {String(session.primary_zone ?? session.zone)}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-ghost text-[11px] shrink-0"
          >
            Paso a paso
          </button>
        </div>
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <Music size={11} /> Playlist de la sesión
          </div>
          <PlaylistControl session={session} garmin={garmin} compact />
        </div>
      </div>
      {open && (
        <SessionDetailModal
          session={session}
          kind={sport === "cycling" ? "bike" : "run"}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const pct = (today: number, base: number) => {
  const v = Math.round(((today - base) / base) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
};

function weekDays(start: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}
